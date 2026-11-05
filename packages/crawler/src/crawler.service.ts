import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigurationService } from '@packages/config';
import { CommandBus } from '@nestjs/cqrs';
import { JobPostCreateCommand } from '@packages/jobPost/commands/jobPostCreate.command';
import { IJobProvider, JOB_PROVIDERS_TOKEN, SearchCriterion } from '@packages/core-providers';
import { JobPost } from '@packages/entities';
import { JobPostService } from '@packages/jobPost/jobPost.service';
import { EmployeeService } from '@packages/employee/employee.service';

/**
 * Crawler responsible to query external APIs / Data sources and store results into DB.
 *
 * The crawler is driven by per-employee search criteria stored in the database.
 * On each crawl cycle it:
 * 1. Loads all active employees with their job search criteria
 * 2. Deduplicates criteria (same keyword+location+country = one API call)
 * 3. Calls each provider's getJobsForCriteria() per unique criterion
 * 4. Stores results via CQRS JobPostCreateCommand
 * 5. The saga then matches jobs to employees and sends notifications
 */
@Injectable()
export class CrawlerService {
	private readonly logger = new Logger(CrawlerService.name);

	constructor(
		private readonly commandBus: CommandBus,
		private readonly configService: ConfigurationService,
		private readonly jobPostService: JobPostService,
		private readonly employeeService: EmployeeService,
		@Optional() @Inject(JOB_PROVIDERS_TOKEN) private readonly providers: IJobProvider[] = [],
	) {
		// Normalize providers to always be an array
		if (!Array.isArray(this.providers)) {
			this.providers = this.providers ? [this.providers] : [];
		}

		// Scheduling (crawl + liveness cron) lives in SchedulerService (packages/ops), which also
		// covers the other periodic jobs; Trigger.dev tasks call /api/crawler/* instead.
		this.logger.log(
			`CrawlerService initialized with ${this.providers.length} job provider(s): ${this.providers.map(p => p.providerName).join(', ') || 'none'}`,
		);
	}

	private _isEnabled = true;
	private _isCrawling = false;

	/**
	 * Scan for stale job posts and verify their liveness.
	 * Processes up to 50 jobs per run to avoid overloading providers.
	 */
	public async runLivenessChecks(): Promise<void> {
		if (!this._isEnabled) {
			this.logger.debug('Crawler is disabled. Skipping liveness checks.');
			return;
		}

		try {
			const staleJobs = await this.jobPostService.findStaleJobs(50);

			if (staleJobs.length === 0) {
				this.logger.debug('No stale jobs found for liveness check.');
				return;
			}

			this.logger.log(`Found ${staleJobs.length} stale jobs for liveness check.`);

			let checked = 0;
			let expired = 0;

			for (const job of staleJobs) {
				try {
					const updated = await this.jobPostService.checkLiveness(job.id);
					checked++;
					if (updated.isExpired) {
						expired++;
					}
				} catch (error) {
					this.logger.warn(
						`Liveness check failed for job ${job.id}: ${error.message}`
					);
				}
			}

			this.logger.log(
				`Liveness check complete: ${checked} checked, ${expired} expired`
			);
		} catch (error) {
			this.logger.error(`Liveness check scan failed: ${error.message}`);
		}
	}

	/**
	 * Crawl all registered job providers using employee search criteria from the database.
	 *
	 * Flow:
	 * 1. Load all active employees with their job search criteria
	 * 2. Deduplicate criteria by (keyword + location + country + jobType + isRemote)
	 * 3. For each provider that supports getJobsForCriteria(), call it per unique criterion
	 * 4. For providers without per-criterion support, fall back to getJobs()
	 * 5. Dispatch all found jobs to the CQRS pipeline
	 */
	public async crawl(): Promise<void> {
		if (!this._isEnabled) {
			this.logger.log('Crawler is disabled. Skipping crawl.');
			return;
		}

		if (this._isCrawling) {
			this.logger.warn(
				'Previous crawl cycle is still in progress. Skipping this cycle to avoid duplicate API calls.',
			);
			return;
		}

		this._isCrawling = true;
		const crawlStart = Date.now();

		try {

		if (!this.providers || this.providers.length === 0) {
			this.logger.log('No job providers registered. Skipping crawl.');
			return;
		}

		// Step 1: Load employee criteria from DB
		const employees = await this.employeeService.getActiveWithJobSearchCriteria();
		let allCriteria: Array<Partial<SearchCriterion>> = employees.flatMap(e => e.jobSearchCriteria ?? []);
		if (allCriteria.length === 0) {
			// no criteria yet: the configured default keywords keep the pipeline alive (issue #3)
			const defaults = this.configService.crawlDefaultKeywords();
			if (defaults.length === 0) {
				this.logger.log(
					`Found ${employees.length} active employee(s) but no search criteria. ` +
					`Skipping crawl. Add criteria for employees or set CRAWL_DEFAULT_KEYWORDS.`,
				);
				return;
			}
			this.logger.log(`No employee search criteria yet: crawling the ${defaults.length} default keyword(s) from CRAWL_DEFAULT_KEYWORDS`);
			// per tenant, so each search runs with that tenant's own source credentials; tenant-less when
			// there are no employees at all (deployment-wide credentials)
			const tenantIds = Array.from(new Set(employees.map((e) => e.tenantId).filter(Boolean)));
			allCriteria = tenantIds.length
				? tenantIds.flatMap((tenantId) => defaults.map((keyword) => ({ keyword, tenantId })))
				: defaults.map((keyword) => ({ keyword }));
		}

		// Step 2: Deduplicate criteria by key fields
		const uniqueCriteria = this.deduplicateCriteria(allCriteria);

		this.logger.log(
			`Crawling for ${employees.length} employee(s): ` +
			`${allCriteria.length} total criteria → ${uniqueCriteria.length} unique searches`,
		);

		const allJobs: JobPost[] = [];

		// Step 3: For each provider, run all unique criteria
		for (const provider of this.providers) {
			try {
				const isEnabled = await provider.isEnabled();
				if (!isEnabled) {
					this.logger.debug(`Provider ${provider.providerName} is disabled. Skipping.`);
					continue;
				}

				if (provider.getJobsForCriteria) {
					// Per-criterion crawling (preferred)
					for (const criterion of uniqueCriteria) {
						try {
							this.logger.log(
								`[${provider.providerName}] Searching: ` +
								`term="${criterion.keyword ?? ''}", ` +
								`location="${criterion.location ?? ''}", ` +
								`country="${criterion.country ?? ''}"`,
							);

							const jobs = await provider.getJobsForCriteria(criterion);

							this.logger.log(
								`[${provider.providerName}] Found ${jobs.length} jobs ` +
								`for "${criterion.keyword ?? 'all'}"`,
							);

							allJobs.push(...jobs);
						} catch (error) {
							this.logger.error(
								`Error fetching jobs from ${provider.providerName} ` +
								`for "${criterion.keyword ?? ''}": ${error.message}`,
							);
						}
					}
				} else {
					// Legacy fallback: single call with no criteria
					this.logger.log(`Fetching jobs from ${provider.providerName} (legacy mode)...`);
					const jobs = await provider.getJobs();
					this.logger.log(
						`Found ${jobs.length} jobs from ${provider.providerName} (legacy).`,
					);
					allJobs.push(...jobs);
				}
			} catch (error) {
				this.logger.error(
					`Error with provider ${provider.providerName}: ${error.message}`,
				);
			}
		}

		// Step 4: Dispatch all jobs to CQRS pipeline
		if (allJobs.length > 0) {
			// searches are per tenant, so the same posting can come back from several of them (and
			// from overlapping criteria of one tenant): one row per (providerCode, providerJobId),
			// or the batch would insert it twice and fail on the unique constraint
			const jobs = this.deduplicateJobs(allJobs);
			this.logger.log(`Total jobs from all providers: ${allJobs.length} (${jobs.length} distinct)`);
			// we do not await because we don't need client to wait for results,
			// we only run crawling in background and this just initialize it
			Promise.resolve(this.commandBus.execute(new JobPostCreateCommand(jobs))).catch((error) => {
				// not awaited: a failed persistence must be logged, never an unhandled rejection that ends the process
				this.logger.error(`Saving ${jobs.length} crawled job posts failed: ${error?.message ?? error}`);
			});
		} else {
			this.logger.debug('No jobs found from any provider.');
		}

		} finally {
			this._isCrawling = false;
			const elapsed = ((Date.now() - crawlStart) / 1000).toFixed(1);
			this.logger.log(`Crawl cycle completed in ${elapsed}s`);
		}
	}

	/**
	 * One job post per provider identity (`providerCode` + `providerJobId`, the unique key of the
	 * table). The search metadata of the copies is combined: the relevance filter reads
	 * `searchKeyword` / `searchCategory` / `searchOccupation` as text, so a posting returned for
	 * "frontend" and for "backend" stays a match for both. Posts without a provider id cannot be
	 * told apart and are kept.
	 */
	private deduplicateJobs(jobs: JobPost[]): JobPost[] {
		const byIdentity = new Map<string, JobPost>();
		const distinct: JobPost[] = [];
		for (const job of jobs) {
			const key = job.providerJobId ? `${job.providerCode}|${job.providerJobId}` : undefined;
			const kept = key ? byIdentity.get(key) : undefined;
			if (!kept) {
				if (key) byIdentity.set(key, job);
				distinct.push(job);
				continue;
			}
			for (const field of ['searchKeyword', 'searchCategory', 'searchOccupation'] as const) {
				kept[field] = mergeTerms(kept[field], job[field]);
			}
		}
		return distinct;
	}

	/**
	 * Deduplicate search criteria by their key fields.
	 * Two criteria are considered identical if they share the same
	 * tenant + keyword + location + country + jobType + isRemote combination: a search is never
	 * shared across tenants, because providers run it with the tenant's own source credentials.
	 */
	private deduplicateCriteria(criteria: Array<{
		tenantId?: string;
		keyword?: string;
		location?: string;
		country?: string;
		jobType?: string;
		isRemote?: boolean;
		hoursOld?: number;
	}>): SearchCriterion[] {
		const seen = new Map<string, SearchCriterion>();

		for (const c of criteria) {
			const key = [
				c.tenantId ?? '',
				c.keyword ?? '',
				c.location ?? '',
				c.country ?? '',
				c.jobType ?? '',
				String(c.isRemote ?? ''),
			].join('|');

			if (!seen.has(key)) {
				seen.set(key, {
					tenantId: c.tenantId || undefined,
					keyword: c.keyword || undefined,
					location: c.location || undefined,
					country: c.country || undefined,
					jobType: c.jobType || undefined,
					isRemote: c.isRemote ?? undefined,
					hoursOld: c.hoursOld ?? undefined,
				});
			}
		}

		return Array.from(seen.values());
	}

	/**
	 * Enable or disable the crawler
	 */
	public setEnabled(enabled: boolean): void {
		this._isEnabled = enabled;
		this.logger.log(`Crawler ${enabled ? 'enabled' : 'disabled'}`);
	}

	/**
	 * Get the list of registered providers
	 */
	public getProviders(): IJobProvider[] {
		return this.providers;
	}
}

/** "frontend" + "backend" → "frontend, backend" (each term once); nothing when neither side has a term. */
const mergeTerms = (a: string | undefined, b: string | undefined): string | undefined => {
	const terms = new Set([a, b].flatMap((value) => (value ?? '').split(',').map((term) => term.trim()).filter(Boolean)));
	return terms.size ? Array.from(terms).join(', ') : undefined;
};
