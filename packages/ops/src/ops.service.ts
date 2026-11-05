import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, MoreThanOrEqual, Not, Or, Repository } from 'typeorm';
import { AiScoringService } from '@packages/ai/ai-scoring.service';
import { ConfigurationService } from '@packages/config';
import { AutomationTask, Employee, EmployeeJobApplication, EmployeeJobPost } from '@packages/entities';
import { NovuService } from '@packages/novu/novu.service';
import { AutomationTaskFinishedEvent } from '@packages/automationTask/events/automationTaskFinished.event';

export interface DigestResult {
	since: string;
	recipientCount: number;
	totalMatches: number;
	skipped: number;
}

export interface CleanupResult {
	timeoutHours: number;
	tasksTimedOut: number;
}

export interface ScoreResult {
	scored: number;
	/** Attempts that failed; a match is retried on later runs until MAX_SCORING_ATTEMPTS. */
	failed: number;
	/** Matches without a job post or employee any more; marked so they do not block the next batch. */
	unscorable: number;
	/** Candidates claimed by another run in the meantime (overlapping runs never score the same row). */
	skipped: number;
	/** Matches still eligible after this run, counted afresh: failures below the retry cap are back in the queue, rows held by other live runs are not. */
	remaining: number;
}

/** Automation task statuses that mean "not finished yet" (the application saga creates tasks as `open`). */
export const PENDING_TASK_STATUSES = ['open', 'created', 'in_progress'];
/** Status given to a pending task that outlived the timeout. */
export const TIMED_OUT_TASK_STATUS = 'timeout' as const;
/** `explanation` stored on a match that cannot be scored because its job post or employee is gone. */
export const UNSCORABLE_EXPLANATION = 'Not scored: the job post or the employee no longer exists';
/** After this many failed attempts a match is left unscored (terminal) instead of blocking the queue. */
export const MAX_SCORING_ATTEMPTS = 3;
/** A claim older than this belongs to a run that died; the match is claimable again. */
export const STALE_SCORING_CLAIM_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_MATCHES = 5;

/**
 * Cross-tenant maintenance jobs. They are started by the scheduler (in-process cron, Trigger.dev
 * tasks or an external caller of `/api/ops/*` with the service token) and never by a tenant
 * request, so they work on the repositories directly instead of the tenant-scoped services.
 */
@Injectable()
export class OpsService {
	private readonly logger = new Logger(OpsService.name);
	/** The scoring run in progress, if any: callers that overlap it share its result instead of racing it. */
	private scoringRun: Promise<ScoreResult> | null = null;

	constructor(
		@InjectRepository(EmployeeJobPost) private readonly matches: Repository<EmployeeJobPost>,
		@InjectRepository(EmployeeJobApplication) private readonly applications: Repository<EmployeeJobApplication>,
		@InjectRepository(AutomationTask) private readonly tasks: Repository<AutomationTask>,
		@InjectRepository(Employee) private readonly employees: Repository<Employee>,
		private readonly aiScoringService: AiScoringService,
		private readonly configurationService: ConfigurationService,
		private readonly novuService: NovuService,
		private readonly eventBus: EventBus,
		@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch
	) {}

	/**
	 * Daily digest: one `daily-digest` Novu notification per active employee that has new matches
	 * or application activity since `since` (default: the last 24 hours). Employees without
	 * activity are skipped, and so is everything when Novu is not configured. Only notifications
	 * Novu accepted count as sent; a failed send counts as skipped.
	 *
	 * Counts: `newMatchCount` = matches created in the window; `applicationsSubmitted` =
	 * applications submitted (`appliedDate`) in the window; `statusChanges` = applications that
	 * existed before the window and were submitted in it (draft → applied, the one status
	 * transition the data model records).
	 */
	public async sendDailyDigest(since: Date = new Date(Date.now() - DAY_MS)): Promise<DigestResult> {
		const result: DigestResult = { since: since.toISOString(), recipientCount: 0, totalMatches: 0, skipped: 0 };
		if (!this.novuService.isEnabled()) {
			this.logger.log('Novu is not configured: daily digest skipped');
			return result;
		}
		const employees = await this.employees.find({
			where: { isActive: true, isArchived: false },
			relations: { user: true },
		});
		for (const employee of employees) {
			// the full count, and only the best few for the details (unscored matches last)
			const [topMatches, newMatchCount] = await this.matches.findAndCount({
				where: { employeeId: employee.id, isArchived: false, createdAt: MoreThanOrEqual(since) },
				relations: { jobPost: true },
				order: { matchScore: { direction: 'DESC', nulls: 'LAST' } },
				take: TOP_MATCHES,
			});
			const applicationsSubmitted = await this.applications.count({
				where: { employeeId: employee.id, appliedDate: MoreThanOrEqual(since) },
			});
			const statusChanges = await this.applications.count({
				where: { employeeId: employee.id, appliedDate: MoreThanOrEqual(since), createdAt: LessThan(since) },
			});
			if (newMatchCount === 0 && applicationsSubmitted === 0 && statusChanges === 0) {
				result.skipped++;
				continue;
			}
			try {
				await this.novuService.sendDailyDigest(
					{
						id: employee.id,
						firstName: employee.firstName,
						lastName: employee.lastName,
						userId: employee.userId,
						email: employee.user?.email,
					},
					{
						employeeId: employee.id,
						newMatchCount,
						applicationsSubmitted,
						statusChanges,
						topMatches: topMatches.map((match) => ({
							jobTitle: match.jobPost?.title ?? '',
							matchScore: match.matchScore ?? 0,
							providerCode: match.providerCode,
						})),
					},
					{ throwOnError: true }
				);
				result.recipientCount++;
				result.totalMatches += newMatchCount;
			} catch (error) {
				this.logger.warn(`Daily digest for employee ${employee.id} failed: ${error.message}`);
				result.skipped++;
			}
		}
		this.logger.log(
			`Daily digest: ${result.recipientCount} recipients, ${result.totalMatches} new matches, ${result.skipped} skipped`
		);
		return result;
	}

	/**
	 * Marks automation tasks that stayed pending longer than `timeoutHours` as timed out, and
	 * publishes `AutomationTaskFinishedEvent` (status `timeout`) for each of them so the employee is
	 * notified once.
	 *
	 * Each task is moved with its own conditional update (still pending): a task that a client
	 * finishes between the read and the write keeps its outcome, is not counted and gets no timeout
	 * notification (its own transition was notified by AutomationTaskSubscriber). A bulk UPDATE
	 * would not tell which rows it changed.
	 */
	public async cleanupStaleTasks(
		timeoutHours: number = this.configurationService.staleTaskTimeoutHours()
	): Promise<CleanupResult> {
		if (!Number.isFinite(timeoutHours) || timeoutHours <= 0) {
			// a zero or negative threshold would time out every open task, the ones just created included
			throw new Error(`timeoutHours must be a positive number (got ${timeoutHours})`);
		}
		const cutoff = new Date(Date.now() - timeoutHours * 60 * 60 * 1000);
		const stale = await this.tasks.find({
			where: { status: In(PENDING_TASK_STATUSES), createdAt: LessThan(cutoff) },
			select: { id: true, status: true },
		});
		const executedDate = new Date();
		let tasksTimedOut = 0;
		for (const task of stale) {
			const update = await this.tasks.update(
				{ id: task.id, status: In(PENDING_TASK_STATUSES) },
				{ status: TIMED_OUT_TASK_STATUS, executedDate }
			);
			if (update.affected) {
				tasksTimedOut += 1;
				this.eventBus.publish(new AutomationTaskFinishedEvent(task.id, TIMED_OUT_TASK_STATUS, task.status));
			}
		}
		this.logger.log(`Stale automation tasks: ${tasksTimedOut} timed out (pending for more than ${timeoutHours}h)`);
		return { timeoutHours, tasksTimedOut };
	}

	/**
	 * Scores matches that were saved without an AI score (scoring failed or was unavailable when
	 * the match was created), fewest attempts and oldest first, up to `limit` per run.
	 *
	 * - One run at a time per process: a caller that overlaps a run (cron tick, HTTP) shares its result.
	 * - Each match is claimed with a conditional update (`scoringStartedAt` = the claim's identity,
	 *   attempt counter, all eligibility predicates re-checked) before the paid AI call, so runs in
	 *   other replicas never score the same row; a claim older than STALE_SCORING_CLAIM_MS belongs to
	 *   a dead run and is taken over, after which the original run's late result is discarded.
	 * - Without an OpenRouter key the run fails before claiming anything (no attempts consumed).
	 * - Only the scoring fields are written back, so a dismissal or an application finalised
	 *   during the AI call is never overwritten.
	 * - A match that failed MAX_SCORING_ATTEMPTS times stays unscored but leaves the queue;
	 *   its last error is kept in `scoringError`. A run that died during a match's final attempt
	 *   left a claim no batch would ever take over (the retry cap excludes the row): such claims
	 *   are released with the interruption recorded, so the row reads as exhausted, not as claimed.
	 */
	public scorePendingMatches(limit = this.configurationService.scorePendingLimit()): Promise<ScoreResult> {
		if (this.scoringRun) {
			this.logger.log('Scoring already in progress: joining the running batch');
			return this.scoringRun;
		}
		this.scoringRun = this.runScoring(limit).finally(() => {
			this.scoringRun = null;
		});
		return this.scoringRun;
	}

	private async runScoring(limit: number): Promise<ScoreResult> {
		if (!pluginEnabled(this.plugins, CAPABILITY_PLUGINS.matchScoring)) {
			// nothing claimed, no attempts consumed: the matches stay scorable for when the plugin is on
			throw new Error('The match-scoring plugin is disabled (GAUZY_AI_PLUGINS_DISABLED): pending matches cannot be scored');
		}
		if (!this.configurationService.openRouterApiKey()) {
			// no claims, no attempts consumed: the matches stay scorable for when the key is configured
			throw new Error('OPENROUTER_API_KEY is not configured: pending matches cannot be scored');
		}
		const stale = new Date(Date.now() - STALE_SCORING_CLAIM_MS);
		// bookkeeping first: claims abandoned on the final attempt (see above) get their terminal state
		const abandoned = await this.matches.update(
			{ scoredAt: IsNull(), scoringAttempts: MoreThanOrEqual(MAX_SCORING_ATTEMPTS), scoringStartedAt: LessThan(stale) },
			{
				scoringStartedAt: null,
				scoringError: `Interrupted on the final attempt (${MAX_SCORING_ATTEMPTS}/${MAX_SCORING_ATTEMPTS}): the scoring run died before writing a result`,
			}
		);
		if (abandoned.affected) {
			this.logger.warn(`${abandoned.affected} match(es) were left claimed by a run that died on their final attempt: released as exhausted`);
		}
		const claimable = {
			scoredAt: IsNull(),
			isArchived: false,
			// rows without a job post or employee reference can never be scored and must not fill the batch
			jobPostId: Not(IsNull()),
			employeeId: Not(IsNull()),
			scoringAttempts: LessThan(MAX_SCORING_ATTEMPTS),
			scoringStartedAt: Or(IsNull(), LessThan(stale)),
		};
		const candidates = await this.matches.find({
			where: claimable,
			select: { id: true, scoringAttempts: true },
			order: { scoringAttempts: 'ASC', createdAt: 'ASC' },
			take: limit,
		});
		const result: ScoreResult = { scored: 0, failed: 0, unscorable: 0, skipped: 0, remaining: 0 };
		const modelUsed = this.configurationService.aiScoringModel() || 'openai/gpt-4o-mini';

		for (const candidate of candidates) {
			const attempt = (candidate.scoringAttempts ?? 0) + 1;
			const claimedAt = new Date();
			// Claim: re-checks every eligibility predicate against the live row (not the candidate
			// snapshot), so an outdated snapshot cannot bypass the retry cap or claim a dismissed match;
			// exactly one run succeeds, the others see affected = 0. `claimedAt` is the claim's identity.
			const claim = await this.matches.update(
				{
					id: candidate.id,
					scoredAt: IsNull(),
					isArchived: false,
					scoringAttempts: candidate.scoringAttempts ?? 0,
					scoringStartedAt: Or(IsNull(), LessThan(stale)),
				},
				{ scoringStartedAt: claimedAt, scoringAttempts: attempt }
			);
			if (!claim.affected) {
				result.skipped++;
				continue;
			}
			// every later write requires the claim to be ours still and the match to be still unscored:
			// after STALE_SCORING_CLAIM_MS another run may have taken the match over, and a user's
			// rescoreMatch() may have scored it meanwhile — neither may be overwritten by our result
			const owned = { id: candidate.id, scoringStartedAt: claimedAt, scoredAt: IsNull() };
			const match = await this.matches.findOne({
				where: { id: candidate.id },
				// the employee's search criteria are the skills fallback of the scoring prompt
				relations: { jobPost: true, employee: { jobSearchCriteria: true } },
			});
			if (!match?.jobPost || !match?.employee) {
				// the referenced row is gone: mark it so the next batch moves on
				await this.matches.update(owned, { scoredAt: new Date(), explanation: UNSCORABLE_EXPLANATION, scoringStartedAt: null });
				result.unscorable++;
				continue;
			}
			try {
				const scoring = await this.aiScoringService.scoreMatch(match.jobPost, match.employee);
				const written = await this.matches.update(owned, {
					matchScore: scoring.matchScore,
					skillsEvidence: scoring.skillsEvidence,
					riskFlags: scoring.riskFlags,
					budgetFit: scoring.budgetFit,
					recommendedAction: scoring.recommendedAction,
					explanation: scoring.explanation,
					modelUsed,
					scoredAt: new Date(),
					scoringStartedAt: null,
					scoringError: null,
				});
				if (written.affected) {
					result.scored++;
				} else {
					result.skipped++;
					this.logger.warn(`Match ${candidate.id}: claim expired during scoring, result discarded (another run owns it)`);
				}
			} catch (error) {
				result.failed++;
				await this.matches.update(owned, {
					scoringError: String(error?.message ?? error).slice(0, 500),
					scoringStartedAt: null,
				});
				this.logger.warn(
					`Scoring match ${candidate.id} failed (attempt ${attempt}/${MAX_SCORING_ATTEMPTS}${attempt >= MAX_SCORING_ATTEMPTS ? ', giving up' : ''}): ${error.message}`
				);
			}
		}
		// counted after the batch: a failed attempt below the retry cap released its claim and is eligible again
		result.remaining = await this.matches.count({
			where: { ...claimable, scoringStartedAt: Or(IsNull(), LessThan(new Date(Date.now() - STALE_SCORING_CLAIM_MS))) },
		});
		this.logger.log(
			`Pending matches: ${result.scored} scored, ${result.failed} failed, ${result.unscorable} unscorable, ${result.skipped} taken by another run, ${result.remaining} remaining`
		);
		return result;
	}
}
