import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { positiveNumberVar } from '@packages/config/schedules';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { EmployeeJobPost, JobPost, SourceConfig } from '@packages/entities';
import { IJobProvider, JOB_PROVIDERS_TOKEN, LivenessJob } from '@packages/core-providers';
import { RequestContext } from '@packages/core/context/request-context';

/**
 * Rows per INSERT/UPDATE statement for the bulk saves. A crawl can return thousands of postings and
 * `job_post` has ~60 columns; one statement for all of them exceeds PostgreSQL's bind-parameter limit
 * (`bind message has N parameter formats but 0 parameters`, which crashed the API on dev). 200 rows
 * keep every statement far below the 65535-parameter ceiling.
 */
const BULK_CHUNK = 200;

/** At most this many matched tenants (with credentials for the verifier's source) are offered to a verifier. */
const MAX_CREDENTIAL_TENANTS = 10;

@Injectable()
export class JobPostService extends TypeOrmCrudService<JobPost>{
	private readonly logger = new Logger(JobPostService.name);

	constructor(
		@InjectRepository(JobPost)
		protected readonly repo: Repository<JobPost>,
		@Optional() @Inject(JOB_PROVIDERS_TOKEN) private readonly providers: IJobProvider[] = [],
	) {
		super(repo);

		// Normalize providers to always be an array
		if (!Array.isArray(this.providers)) {
			this.providers = this.providers ? [this.providers] : [];
		}
	}

	/**
	 * Saves multiple job posts to the database.
	 * 
	 * @param jobs - An array of JobPost instances to be saved.
	 * @returns A Promise resolving to an array of saved JobPost instances.
	 */
	public async saveMany(jobs: JobPost[]): Promise<JobPost[]> {
		return await this.repo.save(jobs, { chunk: BULK_CHUNK });
	}

	/**
	 * Updates multiple job posts in the database.
	 * 
	 * @param jobs - An array of JobPost instances to be updated.
	 * @returns A Promise resolving to an array of updated JobPost instances.
	 */
	public async updateMany(jobs: JobPost[]): Promise<JobPost[]> {
		return await this.repo.save(jobs, { chunk: BULK_CHUNK });
	}

	/**
	 * Check if a job posting is still live/open through the provider that verifies it, and store the
	 * verdict: `isExpired` and `expiryCheckedAt`.
	 *
	 * The verifier is the first provider with `verifyJob()` whose `canVerify(post)` says so; a provider
	 * without `canVerify` verifies the posts it stored (`providerCode === ingestedBy`, or the post's
	 * `providerCode` for rows without `ingestedBy`) that have a URL. So a `linkedin` post stored by
	 * Ever Jobs goes to the Ever Jobs provider, and an Upwork posting (whichever provider stored it,
	 * with or without a URL) to the official Upwork API provider only. No verifier (no URL for a
	 * URL-based check), an error or a result with `verified: false` leaves `isExpired` as it is (a
	 * failure never closes a job) and only stamps `expiryCheckedAt`.
	 *
	 * @param jobPostId - UUID of the job post to verify
	 * @returns The updated JobPost with liveness result
	 */
	public async checkLiveness(jobPostId: string): Promise<JobPost> {
		const jobPost = await this.repo.findOne({ where: { id: jobPostId } });
		if (!jobPost) {
			throw new NotFoundException(`JobPost with id ${jobPostId} not found`);
		}

		const jobUrl = jobPost.url || jobPost.sourceUrl || undefined;
		const job: LivenessJob = {
			id: jobPost.id,
			providerCode: jobPost.providerCode,
			providerJobId: jobPost.providerJobId,
			ingestedBy: jobPost.ingestedBy ?? null,
			url: jobUrl,
			tenantIds: (sourceCode?: string) => this.credentialTenantIds(jobPost.id, sourceCode),
		};
		const provider = this.verifierFor(job);

		if (!provider?.verifyJob) {
			this.logger.warn(
				jobUrl
					? `No liveness verifier for job ${jobPostId} (providerCode "${jobPost.providerCode}", ingestedBy "${jobPost.ingestedBy ?? ''}"). Skipping liveness check.`
					: `JobPost ${jobPostId} has no URL to verify`
			);
			jobPost.expiryCheckedAt = new Date();
			return await this.repo.save(jobPost);
		}

		try {
			const result = await provider.verifyJob(jobUrl ?? '', job);
			jobPost.expiryCheckedAt = new Date();

			if (result.verified === false) {
				// no verdict: the stored state stays (an unverifiable job is neither closed nor reopened)
				this.logger.debug(`Job ${jobPostId} not verified by ${provider.providerCode}: ${result.reason || 'no verdict'}`);
			} else {
				jobPost.isExpired = !result.isOpen;
				if (!result.isOpen) {
					this.logger.log(
						`Job ${jobPostId} is expired: ${result.reason || 'no longer open'}`
					);
				} else {
					this.logger.debug(`Job ${jobPostId} is still open`);
				}
			}
		} catch (error) {
			this.logger.error(
				`Liveness check failed for job ${jobPostId}: ${error instanceof Error ? error.message : error}`
			);
			jobPost.expiryCheckedAt = new Date();
		}

		return await this.repo.save(jobPost);
	}

	/**
	 * The first provider that verifies this post (see `checkLiveness`). The default rule (no
	 * `canVerify`) needs a URL, as `verifyJob(url)` always had one; a provider that can verify
	 * without (by id, through an API) says so in `canVerify`.
	 */
	private verifierFor(job: LivenessJob): IJobProvider | undefined {
		const channel = job.ingestedBy ?? job.providerCode;
		return this.providers.find(
			(p) =>
				typeof p.verifyJob === 'function' &&
				(typeof p.canVerify === 'function' ? p.canVerify(job) : !!job.url && p.providerCode === channel)
		);
	}

	/**
	 * Tenants whose own source credentials a verifier may use for this post. A request (a
	 * `verifyJobLiveness` call) spends only the requesting tenant's credentials: the catalog is
	 * shared and any tenant may ask about any post, so another tenant's must never be used for it.
	 * A background check (the liveness job, no request tenant) uses the tenants the post was matched
	 * for, i.e. the tenants that have it in their pipeline. With `sourceCode`, only those with an
	 * active source config of their own for it that carries credentials (an access token, or a client
	 * id and secret), filtered before the limit: a tenant with usable credentials is never crowded
	 * out by matched tenants without any.
	 */
	private async credentialTenantIds(jobPostId: string, sourceCode?: string): Promise<string[]> {
		const requesting = RequestContext.currentTenantId();
		if (requesting) {
			return [requesting];
		}
		try {
			const query = this.repo.manager
				.getRepository(EmployeeJobPost)
				.createQueryBuilder('ejp')
				.select('ejp.tenantId', 'tenantId')
				.distinct(true)
				.where('ejp.jobPostId = :jobPostId', { jobPostId })
				.andWhere('ejp.tenantId IS NOT NULL');
			if (sourceCode) {
				query.andWhere((qb) => {
					const usableConfig = qb
						.subQuery()
						.select('1')
						.from(SourceConfig, 'sc')
						.where('sc.tenantId = ejp.tenantId')
						.andWhere('sc.sourceCode = :sourceCode', { sourceCode })
						.andWhere('sc.isActive = :configActive', { configActive: true })
						.andWhere('sc.isArchived = :configArchived', { configArchived: false })
						.andWhere(
							"(COALESCE(sc.accessToken, '') <> '' OR (COALESCE(sc.clientId, '') <> '' AND COALESCE(sc.clientSecret, '') <> ''))"
						)
						.getQuery();
					return `EXISTS ${usableConfig}`;
				});
			}
			const rows: Array<{ tenantId: string }> = await query.limit(MAX_CREDENTIAL_TENANTS).getRawMany();
			return [...new Set(rows.map((row) => row.tenantId).filter(Boolean))];
		} catch (error) {
			this.logger.warn(`Matched tenants of job ${jobPostId} unavailable: ${error instanceof Error ? error.message : error}`);
			return [];
		}
	}

	/**
	 * Open posts due for a liveness check: never checked, or last checked more than
	 * `LIVENESS_RECHECK_HOURS` ago (default 24; a post found open or without a verdict is checked
	 * again later). Never-checked posts first, then the longest unchecked (oldest `expiryCheckedAt`),
	 * then by creation date.
	 *
	 * @param limit - Maximum number of jobs to return (default: 50)
	 * @param now - The reference time for the recheck cutoff (tests)
	 */
	public async findStaleJobs(limit = 50, now: Date = new Date()): Promise<JobPost[]> {
		const recheckHours = positiveNumberVar('LIVENESS_RECHECK_HOURS', 24);
		const cutoff = new Date(now.getTime() - recheckHours * 60 * 60 * 1000);
		return this.repo.find({
			where: [
				{ isExpired: false, expiryCheckedAt: IsNull() },
				{ isExpired: false, expiryCheckedAt: LessThan(cutoff) },
			],
			order: { expiryCheckedAt: { direction: 'ASC', nulls: 'FIRST' }, createdAt: 'ASC' },
			take: limit,
		});
	}
}
