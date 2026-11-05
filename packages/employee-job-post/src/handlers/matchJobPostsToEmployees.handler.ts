import { Logger, Optional } from '@nestjs/common';
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { ConfigurationService } from '@packages/config';
import { TriggerService } from '@packages/trigger/trigger.service';
import { TRIGGER_TASKS } from '@packages/trigger/trigger.tasks';
import { MatchJobPostsToEmployeesCommand } from '../commands/matchJobPostsToEmployees.command';
import { EmployeeJobPostService, MatchSummary } from '../employeeJobPost.service';

/**
 * A failed scoring attempt is retried this much later by `score-matches`: long enough for a rate
 * limit or a short provider outage to pass (each run spends one of the match's MAX_SCORING_ATTEMPTS),
 * much sooner than the next scheduled `score-pending-matches` run.
 */
export const PENDING_SCORING_DELAY = '5m';

/**
 * Runs the matching pass of a crawl: new posts against every employee (`match()`), posts that were
 * already stored against the employees whose inputs changed (`rematch()`).
 *
 * Matches whose AI scoring failed are stored without a score. When Trigger.dev is enabled
 * (`trigger-dev` plugin, `TRIGGER_DEV_ENABLED=true`, `TRIGGER_SECRET_KEY`), the pass then enqueues the
 * `score-matches` event task once, delayed by PENDING_SCORING_DELAY; otherwise they wait for the
 * scheduled `score-pending-matches` job, as before.
 */
@CommandHandler(MatchJobPostsToEmployeesCommand)
export class MatchJobPostsToEmployeesCommandHandler implements ICommandHandler<MatchJobPostsToEmployeesCommand> {
	private readonly logger = new Logger(MatchJobPostsToEmployeesCommandHandler.name);

	constructor(
		private readonly employeeJobPostService: EmployeeJobPostService,
		private readonly configurationService: ConfigurationService,
		@Optional() private readonly triggerService?: TriggerService,
	) { }

	async execute(command: MatchJobPostsToEmployeesCommand): Promise<MatchSummary> {
		const { jobPosts, options } = command;

		const summary = options?.existing
			? await this.employeeJobPostService.rematch(jobPosts)
			: await this.employeeJobPostService.match(jobPosts);

		await this.enqueuePendingScoring(summary);
		return summary;
	}

	/**
	 * One delayed `score-matches` run for the matches this pass stored without a score (Trigger.dev
	 * only). The run reports scoring failures in its result instead of failing, on purpose: the
	 * task's own retries (seconds apart) cover a failed call to the API, while a match that fails
	 * again is retried by later runs within its MAX_SCORING_ATTEMPTS.
	 */
	private async enqueuePendingScoring(summary: MatchSummary): Promise<void> {
		if (!summary || summary.unscored === 0 || !this.triggerService?.isEnabled()) {
			return;
		}
		const limit = Math.min(summary.unscored, this.configurationService.scorePendingLimit());
		try {
			await this.triggerService.trigger(TRIGGER_TASKS.scoreMatches, { limit }, { delay: PENDING_SCORING_DELAY });
		} catch (error) {
			// the scheduled score-pending-matches run picks them up anyway
			this.logger.warn(`Enqueuing ${TRIGGER_TASKS.scoreMatches} failed: ${error instanceof Error ? error.message : error}`);
		}
	}
}
