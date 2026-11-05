import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { InjectPubSub } from '@ptc-org/nestjs-query-graphql';
import { PubSub } from 'graphql-subscriptions';
import { TenantAwareCrudService } from '@packages/core/crud';
import { currentTenantWhere } from '@packages/core/context';
import { EmployeeJobPostCreateCommand } from './commands/employeeJobPostCreate.command';
import { Employee, EmployeeJobPost, JobPost } from '@packages/entities';
import { hourlyRateFits } from './rate-fit';
import { EmployeeService } from '@packages/employee/employee.service';
import { AiScoringService } from '@packages/ai/ai-scoring.service';
import { ConfigurationService } from '@packages/config';
import { NovuService } from '@packages/novu';
import { BrowseJobMatchesArgs, BrowseJobsSortBy } from './dto/browseJobMatches.args';

/** PubSub event name constants */
export const MATCH_CREATED_EVENT = 'employeeJobPostCreated';
export const MATCH_UPDATED_EVENT = 'employeeJobPostUpdated';

/** Outcome of a matching pass. */
export interface MatchSummary {
	/** Matches stored by the pass. */
	created: number;
	/** Of those, the ones stored without an AI score (scoring failed); pending-match scoring picks them up. */
	unscored: number;
}

/** Ids per `IN (...)` lookup, far below the bind-parameter limit of PostgreSQL. */
const ID_CHUNK = 500;

/**
 * The last time something that decides an employee's matches changed: the employee (profile, rate,
 * activation) or one of their search criteria (added, edited, re-activated).
 */
export function matchingInputsChangedAt(employee: Employee): Date | undefined {
	const times = [employee.createdAt, employee.updatedAt, ...(employee.jobSearchCriteria ?? []).flatMap((c) => [c.createdAt, c.updatedAt])]
		.map((value) => (value ? new Date(value).getTime() : NaN))
		.filter((time) => !Number.isNaN(time));
	return times.length > 0 ? new Date(Math.max(...times)) : undefined;
}

/**
 * Everything matching and AI scoring read from an employee (`findRelevantJobs()`, the rate rule,
 * `AiScoringService`'s prompt): two employees with the same fingerprint get the same matches.
 */
export function matchingInputsFingerprint(employee: Employee): string {
	const criteria = (employee.jobSearchCriteria ?? [])
		.map((c) => [c.id ?? '', c.keyword ?? null, c.occupation ?? null, c.category ?? null, Boolean(c.isActive), Boolean(c.isArchived)])
		.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
	return JSON.stringify([
		employee.firstName ?? null,
		employee.lastName ?? null,
		employee.bio ?? null,
		employee.skillsSummary ?? null,
		employee.experienceSummary ?? null,
		employee.preferredRate == null ? null : String(employee.preferredRate),
		employee.jobType ?? null,
		criteria,
	]);
}

/**
 * How far after the timestamp of an input change a stored post still counts as stored before it:
 * covers a transaction that committed after its start-time stamp and the sub-millisecond precision
 * lost between the database and JavaScript. At worst a pair is evaluated once more.
 */
export const REMATCH_TIMESTAMP_MARGIN_MS = 60 * 1000;

/** Re-match bookkeeping of one employee (see `EmployeeJobPostService.rematchStateOf()`). */
interface RematchState {
	/** `matchingInputsFingerprint()` of the inputs this state is about */
	fingerprint: string;
	/** the newest stored timestamp of those inputs seen so far (epoch ms) */
	changedAt: number;
	/** posts stored up to this time (epoch ms, Infinity = all) were matched against former inputs */
	storedBefore: number;
	/** the stored posts already evaluated against these inputs, rejected pairs included */
	evaluated: Set<string>;
}

@Injectable()
export class EmployeeJobPostService extends TenantAwareCrudService<EmployeeJobPost> {
	private readonly logger = new Logger(EmployeeJobPostService.name);

	/**
	 * Re-match bookkeeping per employee (`rematchStateOf()`): the content of their matching inputs, the
	 * stored posts concerned by its last change and those already evaluated against it, rejected pairs
	 * included. Only stored timestamps (the database stamps them) are compared with each other, never
	 * this process's clock. In memory: after a restart the posts stored before an employee's last
	 * change are evaluated once more (once per process start, never once per crawl).
	 */
	private readonly rematchState = new Map<string, RematchState>();

	/**
	 * Matching passes (new posts and re-matches) run one at a time: a pass sees the bookkeeping of the
	 * previous one, and two passes never score the same pair at the same time.
	 */
	private matchingQueue: Promise<unknown> = Promise.resolve();

	constructor(
		@InjectRepository(EmployeeJobPost)
		protected readonly repo: Repository<EmployeeJobPost>,
		private readonly commandBus: CommandBus,
		private readonly employeeService: EmployeeService,
		private readonly aiScoringService: AiScoringService,
		private readonly configurationService: ConfigurationService,
		private readonly novuService: NovuService,
		@InjectPubSub() private readonly pubSub: PubSub,
	) {
		super(repo);
	}

	/**
	 * Processes new job posts by matching them to active employees.
	 * This method called when new jobs crawled (e.g. from Ever Jobs API) to assign them in DB to relevant employees (matching)
	 *
	 * Uses keyword-based relevance filtering first, then AI scoring for deeper analysis.
	 *
	 * @param jobs
	 */
	public async match(jobs: Array<JobPost>): Promise<MatchSummary> {
		if (jobs.length === 0) {
			return { created: 0, unscored: 0 };
		}
		return this.inMatchingQueue(() => this.runMatch(jobs));
	}

	private async runMatch(jobs: Array<JobPost>): Promise<MatchSummary> {
		const employees = await this.employeeService.getActiveWithJobSearchCriteria();

		this.logger.log(`Processing matching for ${jobs.length} new Jobs to ${employees.length} Employees`);

		return this.matchEmployees(
			employees.map((employee) => {
				const state = this.rematchStateOf(employee);
				return {
					employee,
					jobs,
					// a new post stored before the employee's inputs last changed (they changed between storing
					// and matching it) is a re-match candidate: it was just evaluated against these inputs
					onDone: () =>
						jobs
							.filter((job) => job.id && job.createdAt && new Date(job.createdAt).getTime() <= state.storedBefore)
							.forEach((job) => state.evaluated.add(job.id)),
				};
			})
		);
	}

	/** Runs `pass` after the passes already queued (see `matchingQueue`). */
	private inMatchingQueue<T>(pass: () => Promise<T>): Promise<T> {
		const run = this.matchingQueue.then(pass);
		this.matchingQueue = run.catch(() => undefined);
		return run;
	}

	/**
	 * Re-matches posts that were already stored: a provider found them again, or the `source-db`
	 * provider re-offered them ("blending": a post found through one employee's criteria can match
	 * another employee, and criteria added after a post was stored still get it).
	 *
	 * AI scoring rejects pairs below AI_MATCH_THRESHOLD without storing anything, so evaluating every
	 * pair again on each crawl would score the same pairs over and over. Only pairs whose inputs
	 * changed are evaluated: an employee is matched against a post when the employee or one of their
	 * search criteria was created or updated after the post was stored, once per version of those
	 * inputs (`rematchState`), whichever crawl brings the post. Pairs that already have a match are
	 * skipped (`matchEmployees`), and the stored state of the posts is used: inactive, archived and
	 * expired posts are not matched.
	 */
	public rematch(jobs: Array<JobPost>): Promise<MatchSummary> {
		return this.inMatchingQueue(() => this.runRematch(jobs));
	}

	private async runRematch(jobs: Array<JobPost>): Promise<MatchSummary> {
		const ids = Array.from(new Set(jobs.map((job) => job.id).filter(Boolean)));
		if (ids.length === 0) {
			return { created: 0, unscored: 0 };
		}

		// each active employee's matching inputs; employees no longer active are forgotten
		const employees = await this.employeeService.getActiveWithJobSearchCriteria();
		const active = new Set(employees.map((employee) => employee.id));
		for (const id of Array.from(this.rematchState.keys())) {
			if (!active.has(id)) {
				this.rematchState.delete(id);
			}
		}
		const states = employees.map((employee) => ({ employee, state: this.rematchStateOf(employee) }));

		// per employee: the matchable posts stored before their inputs last changed, not evaluated
		// against them yet (a post that is expired now stays pending: it may reopen)
		const stored = await this.findPostStates(ids);
		const pending = states
			.map(({ employee, state }) => ({
				employee,
				state,
				postIds: ids.filter((id) => {
					const post = stored.get(id);
					return post?.matchable && post.storedAt <= state.storedBefore && !state.evaluated.has(id);
				}),
			}))
			.filter(({ postIds }) => postIds.length > 0);
		if (pending.length === 0) {
			return { created: 0, unscored: 0 };
		}

		// the crawled objects only carry what the provider returned: match the stored rows
		const posts = new Map(
			(await this.findMatchablePosts(Array.from(new Set(pending.flatMap(({ postIds }) => postIds))))).map((post) => [post.id, post])
		);
		this.logger.log(
			`Re-matching ${posts.size} stored Jobs for ${pending.length} Employee(s) whose criteria or profile changed after they were stored`
		);

		return this.matchEmployees(
			pending.map(({ employee, state, postIds }) => {
				const jobs = postIds.map((id) => posts.get(id)).filter(Boolean);
				return {
					employee,
					jobs,
					// only the posts really matched are settled, once this employee's matching completed
					// (after a failure, or for a post that stopped being matchable meanwhile, a later pass
					// evaluates the pair)
					onDone: () => jobs.forEach((job) => state.evaluated.add(job.id)),
				};
			})
		);
	}

	/**
	 * The bookkeeping of one employee, renewed when their matching inputs changed.
	 *
	 * What changed is decided by the content (`matchingInputsFingerprint()`), so a change that leaves
	 * the timestamps as they were (a deleted criterion, a timestamp a client set) is caught as well.
	 * Which stored posts it concerns is decided by time: the posts stored up to the change, which were
	 * matched against the former inputs when they were new. The time of a change is the newest stored
	 * timestamp of the employee and their criteria when that moved forward; otherwise it is unknown and
	 * every stored post is concerned. After a restart, with no bookkeeping yet, the stored timestamps
	 * are all there is (they are server-owned on the GraphQL mutations, see ServerTimestamps*Hook).
	 */
	private rematchStateOf(employee: Employee): RematchState {
		const fingerprint = matchingInputsFingerprint(employee);
		const changedAt = matchingInputsChangedAt(employee)?.getTime() ?? -Infinity;
		const known = this.rematchState.get(employee.id);
		if (known && known.fingerprint === fingerprint) {
			if (changedAt > known.changedAt) {
				// touched again with the same content in the end (reactivated, changed and changed back, the
				// owner bump before a delete): the posts stored meanwhile were matched against other inputs,
				// or not at all while the employee was inactive, so they are concerned too; the pairs
				// already evaluated against these inputs stay settled
				known.changedAt = changedAt;
				known.storedBefore = Math.max(known.storedBefore, changedAt + REMATCH_TIMESTAMP_MARGIN_MS);
			}
			return known;
		}
		const changeTime = !known ? changedAt : changedAt > known.changedAt ? changedAt : Infinity;
		const state: RematchState = {
			fingerprint,
			changedAt: Math.max(changedAt, known?.changedAt ?? -Infinity),
			// a change is stamped when its transaction started, and the database keeps microseconds
			// where JavaScript reads milliseconds: the posts stored just after it are included too
			storedBefore: changeTime + REMATCH_TIMESTAMP_MARGIN_MS,
			evaluated: new Set<string>(),
		};
		this.rematchState.set(employee.id, state);
		return state;
	}

	/**
	 * When each of the stored posts among `ids` was stored (epoch ms of the stored `createdAt`) and
	 * whether it can be matched now (active, not archived, not expired); a light query, the posts are
	 * loaded in full only when a pair is left to evaluate.
	 */
	private async findPostStates(ids: string[]): Promise<Map<string, { storedAt: number; matchable: boolean }>> {
		const states = new Map<string, { storedAt: number; matchable: boolean }>();
		for (let i = 0; i < ids.length; i += ID_CHUNK) {
			const rows = await this.repo.manager.find(JobPost, {
				where: { id: In(ids.slice(i, i + ID_CHUNK)) },
				select: { id: true, createdAt: true, isActive: true, isArchived: true, isExpired: true },
			});
			rows.filter((row) => row.createdAt).forEach((row) =>
				states.set(row.id, {
					storedAt: new Date(row.createdAt).getTime(),
					matchable: Boolean(row.isActive) && !row.isArchived && !row.isExpired,
				})
			);
		}
		return states;
	}

	/** The stored, still matchable (active, not archived, not expired) posts among `ids`. */
	private async findMatchablePosts(ids: string[]): Promise<JobPost[]> {
		const posts: JobPost[] = [];
		for (let i = 0; i < ids.length; i += ID_CHUNK) {
			posts.push(
				...(await this.repo.manager.find(JobPost, {
					where: { id: In(ids.slice(i, i + ID_CHUNK)), isActive: true, isArchived: false },
				}))
			);
		}
		return posts.filter((post) => !post.isExpired);
	}

	/** Ids of the posts among `jobs` that already have a match (archived ones included) for the employee. */
	private async findMatchedJobPostIds(employeeId: string, jobs: JobPost[]): Promise<Set<string>> {
		const ids = jobs.map((job) => job.id).filter(Boolean);
		const matched = new Set<string>();
		for (let i = 0; i < ids.length; i += ID_CHUNK) {
			const rows = await this.repo.find({
				where: { employeeId, jobPostId: In(ids.slice(i, i + ID_CHUNK)) },
				select: { id: true, jobPostId: true },
			});
			rows.forEach((row) => matched.add(row.jobPostId));
		}
		return matched;
	}

	/**
	 * Matches each employee against their posts: keyword relevance, then AI scoring, then one
	 * EmployeeJobPostCreateCommand per employee. A pair that already has a match is neither scored
	 * nor stored again; the create command also skips a pair a concurrent pass stored meanwhile
	 * (unique index on employeeId + jobPostId), and only the matches it really stored are published
	 * and notified.
	 */
	private async matchEmployees(
		assignments: Array<{ employee: Employee; jobs: JobPost[]; onDone?: () => void }>
	): Promise<MatchSummary> {
		const summary: MatchSummary = { created: 0, unscored: 0 };
		const matchThreshold = this.configurationService.aiMatchThreshold();

		// every employee's branch settles before a failure is reported, so the caller (and the next
		// re-match pass, which waits for this one) never runs while scoring is still in progress
		const results = await Promise.allSettled(
			assignments.map(async ({ employee, jobs, onDone }) => {
				await this.matchEmployee(employee, jobs, matchThreshold, summary);
				onDone?.();
			})
		);
		const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
		if (failure) {
			throw failure.reason;
		}
		return summary;
	}

	/** One employee of `matchEmployees()`: adds what it stored to `summary`. */
	private async matchEmployee(employee: Employee, jobs: JobPost[], matchThreshold: number, summary: MatchSummary): Promise<void> {
		// Process each active employee separately
		const employeeJobPosts = new Array<EmployeeJobPost>();

		const criteria = employee.jobSearchCriteria;

		// Find jobs that are relevant to this employee's criteria (each post once)
		const relevantJobs = this.findRelevantJobs(uniqueById(jobs), criteria, employee.preferredRate);

		if (relevantJobs.length === 0) {
			this.logger.debug(
				`No relevant jobs found for Employee ${employee.id} (${criteria?.length ?? 0} criteria)`
			);
			return;
		}

		// Skip the posts this employee is already connected to (one query for all of them)
		const alreadyMatched = await this.findMatchedJobPostIds(employee.id, relevantJobs);
		const candidates = relevantJobs.filter((job) => !alreadyMatched.has(job.id));

		this.logger.log(
			`Found ${relevantJobs.length} relevant jobs for Employee ${employee.id} (out of ${jobs.length} total), ${candidates.length} not matched yet`
		);

		// Process relevant jobs with AI scoring in batches (max 5 concurrent)
		const batchSize = 5;
		for (let i = 0; i < candidates.length; i += batchSize) {
			const batch = candidates.slice(i, i + batchSize);

			const results = await Promise.allSettled(
				batch.map(async (job: JobPost) => {
					const employeeJobPost = new EmployeeJobPost();
					employeeJobPost.employeeId = employee.id;
					employeeJobPost.jobPostId = job.id;
					// createdAt / updatedAt: when the match is stored (the daily digest and the dashboard
					// count matches by createdAt, so a re-matched older post must not be backdated)

					employeeJobPost.jobStatus = job.jobStatus;
					employeeJobPost.jobDateCreated = job.jobDateCreated;
					employeeJobPost.jobType = job.jobType;
					employeeJobPost.providerJobId = job.providerJobId;
					employeeJobPost.providerCode = job.providerCode;

					employeeJobPost.isActive = true;
					employeeJobPost.isArchived = false;
					employeeJobPost.isApplied = false;

					employeeJobPost.tenantId = employee.tenantId;
					employeeJobPost.orgId = employee.orgId;

					// AI Scoring — score match and populate fields
					try {
						const scoringResult = await this.aiScoringService.scoreMatch(job, employee);

						employeeJobPost.matchScore = scoringResult.matchScore;
						employeeJobPost.skillsEvidence = scoringResult.skillsEvidence;
						employeeJobPost.riskFlags = scoringResult.riskFlags;
						employeeJobPost.budgetFit = scoringResult.budgetFit;
						employeeJobPost.recommendedAction = scoringResult.recommendedAction;
						employeeJobPost.explanation = scoringResult.explanation;
						employeeJobPost.modelUsed = this.configurationService.aiScoringModel() || 'openai/gpt-4o-mini';
						employeeJobPost.scoredAt = new Date();

						// Skip matches below threshold
						if (scoringResult.matchScore < matchThreshold) {
							this.logger.debug(
								`Skipping match: Employee ${employee.id} / Job ${job.id} — score ${scoringResult.matchScore} < threshold ${matchThreshold}`
							);
							return; // Don't add to employeeJobPosts
						}
					} catch (error) {
						// AI scoring failed — save match with criteria-only (no AI fields)
						this.logger.warn(
							`AI scoring failed for Employee ${employee.id} / Job ${job.id}: ${error.message}. Saving without AI score.`
						);
					}

					employeeJobPosts.push(employeeJobPost);
				})
			);

			// Log any failures
			results
				.filter((r) => r.status === 'rejected')
				.forEach((r: PromiseRejectedResult) => {
					this.logger.error(`Match processing error: ${r.reason}`);
				});
		}

		if (employeeJobPosts.length > 0) {
			// the matches really stored (a pair stored meanwhile by a concurrent pass is skipped)
			const created: EmployeeJobPost[] =
				(await this.commandBus.execute(new EmployeeJobPostCreateCommand(employeeJobPosts))) ?? [];

			summary.created += created.length;
			summary.unscored += created.filter((ejp) => ejp.scoredAt == null).length;

			// Publish real-time subscription events + send Novu notifications
			const notifyThreshold = this.configurationService.novuMatchNotifyThreshold();
			for (const ejp of created) {
				// GraphQL subscription event
				try {
					await this.pubSub.publish(MATCH_CREATED_EVENT, { [MATCH_CREATED_EVENT]: ejp });
				} catch (err) {
					this.logger.warn(`PubSub publish failed: ${err.message}`);
				}

				// Novu notification for high-scoring matches
				if (ejp.matchScore != null && ejp.matchScore >= notifyThreshold) {
					try {
						await this.novuService.sendMatchAlert(
						{ id: employee.id || '', firstName: employee.firstName, lastName: employee.lastName, userId: employee.userId },
							{ id: ejp.jobPostId, title: undefined, providerCode: ejp.providerCode },
							ejp.matchScore,
							ejp.explanation || 'High-scoring match found'
						);
					} catch (err) {
						this.logger.warn(`Novu notification failed: ${err.message}`);
					}
				}
			}
		}
	}

	/**
	 * Determine which jobs are relevant to an employee based on their search criteria.
	 * 
	 * Uses keyword-based relevance matching instead of exact field matching.
	 * A job is considered relevant if:
	 * 1. Any criterion keyword appears in the job title, description, or skills
	 * 2. Any criterion's occupation matches the job category/function
	 * 3. The employee has no criteria at all (match all jobs for AI scoring)
	 * In every case an hourly job must pay at least the employee's minimum rate when both are known
	 * (issue #52, see rate-fit.ts).
	 */
	private findRelevantJobs(
		jobs: JobPost[],
		criteria: Array<{ keyword?: string; occupation?: string; category?: string; jobType?: string; isActive?: boolean; isArchived?: boolean }>,
		minimumHourlyRate?: number | string | null
	): JobPost[] {
		jobs = jobs.filter((job) => hourlyRateFits(job, minimumHourlyRate));
		const activeCriteria = criteria?.filter(c => c.isActive && !c.isArchived) ?? [];

		// If no active criteria, return all active non-archived jobs
		// (let AI scoring decide relevance)
		if (activeCriteria.length === 0) {
			return jobs.filter(j => j.isActive && !j.isArchived);
		}

		// Build a set of keywords to match against
		const keywords = activeCriteria
			.flatMap(c => [c.keyword, c.occupation, c.category].filter(Boolean))
			.map(k => k.toLowerCase());

		if (keywords.length === 0) {
			return jobs.filter(j => j.isActive && !j.isArchived);
		}

		return jobs.filter(job => {
			if (!job.isActive || job.isArchived) return false;

			// Build searchable text from job fields
			const searchableText = [
				job.title,
				job.description,
				job.skills,
				job.searchKeyword,
				job.searchCategory,
				job.companyName,
				job.jobFunction,
				job.department,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();

			// Check if any keyword appears in the searchable text
			return keywords.some(kw => searchableText.includes(kw));
		});
	}

	/**
	 * Browse job matches for an employee with filtering, sorting, and pagination.
	 */
	public async browseMatches(args: BrowseJobMatchesArgs): Promise<{
		items: EmployeeJobPost[];
		totalCount: number;
		hasMore: boolean;
	}> {
		const where: any = {
			...currentTenantWhere(),
			employeeId: args.employeeId,
			isActive: true,
			isArchived: false,
		};

		if (args.minScore != null && args.minScore > 0) {
			where.matchScore = MoreThanOrEqual(args.minScore);
		}
		if (args.maxScore != null) {
			where.matchScore = where.matchScore
				? { ...where.matchScore, value: args.maxScore }
				: LessThanOrEqual(args.maxScore);
		}
		if (args.budgetFit) where.budgetFit = args.budgetFit;
		if (args.recommendedAction) where.recommendedAction = args.recommendedAction;
		if (args.providerCode) where.providerCode = args.providerCode;
		if (args.isApplied != null) where.isApplied = args.isApplied;

		// Build sort order
		const order: any = {};
		switch (args.sortBy) {
			case BrowseJobsSortBy.SCORE_ASC:
				order.matchScore = 'ASC';
				break;
			case BrowseJobsSortBy.DATE_ASC:
				order.createdAt = 'ASC';
				break;
			case BrowseJobsSortBy.DATE_DESC:
				order.createdAt = 'DESC';
				break;
			case BrowseJobsSortBy.SCORE_DESC:
			default:
				order.matchScore = 'DESC';
				break;
		}

		const take = args.first || 20;
		const skip = args.offset || 0;

		const [items, totalCount] = await this.repo.findAndCount({
			where,
			order,
			take,
			skip,
			relations: { jobPost: true, employee: true },
		});

		return {
			items,
			totalCount,
			hasMore: skip + take < totalCount,
		};
	}

	/**
	 * Re-score an existing employee-job match using AI.
	 */
	public async rescoreMatch(employeeJobPostId: string): Promise<EmployeeJobPost> {
		const ejp = await this.repo.findOneOrFail({
			where: { id: employeeJobPostId, ...currentTenantWhere() } as any,
			relations: { jobPost: true, employee: true },
		});

		const scoringResult = await this.aiScoringService.scoreMatch(
			ejp.jobPost,
			ejp.employee
		);

		ejp.matchScore = scoringResult.matchScore;
		ejp.skillsEvidence = scoringResult.skillsEvidence;
		ejp.riskFlags = scoringResult.riskFlags;
		ejp.budgetFit = scoringResult.budgetFit;
		ejp.recommendedAction = scoringResult.recommendedAction;
		ejp.explanation = scoringResult.explanation;
		ejp.modelUsed = this.configurationService.aiScoringModel() || 'openai/gpt-4o-mini';
		ejp.scoredAt = new Date();

		const saved = await this.repo.save(ejp);

		// Publish rescore event
		try {
			await this.pubSub.publish(MATCH_UPDATED_EVENT, { [MATCH_UPDATED_EVENT]: saved });
		} catch (err) {
			this.logger.warn(`PubSub publish failed: ${err.message}`);
		}

		return saved;
	}

	/**
	 * Dismiss (archive) a match so it no longer appears in browse results.
	 */
	public async dismissMatch(employeeJobPostId: string): Promise<EmployeeJobPost> {
		const scoped = { id: employeeJobPostId, ...currentTenantWhere() } as any;
		await this.repo.findOneOrFail({ where: scoped });
		await this.repo.update(scoped, { isArchived: true } as any);
		const dismissed = await this.repo.findOneOrFail({ where: scoped });

		// Publish dismiss event
		try {
			await this.pubSub.publish(MATCH_UPDATED_EVENT, { [MATCH_UPDATED_EVENT]: dismissed });
		} catch (err) {
			this.logger.warn(`PubSub publish failed: ${err.message}`);
		}

		return dismissed;
	}
}

/** Each post once (posts without an id cannot be told apart and are kept). */
function uniqueById(jobs: JobPost[]): JobPost[] {
	const seen = new Set<string>();
	return jobs.filter((job) => {
		if (!job.id) return true;
		if (seen.has(job.id)) return false;
		seen.add(job.id);
		return true;
	});
}
