import { schedules, task, logger } from '@trigger.dev/sdk/v3';
import { callApi, tenantHeaders } from './api-client';
import { cronOf } from './schedule';
import { scorePendingLimit } from '../../packages/config/src/schedules';
import { TRIGGER_TASKS } from '../../packages/trigger/src/trigger.tasks';

interface ScoreResult {
	scored: number;
	failed: number;
	unscorable: number;
	remaining: number;
}

const scorePending = async (limit: number): Promise<ScoreResult> => {
	logger.info('Scoring pending matches', { limit });
	const result = await callApi<ScoreResult>('/api/ops/score', { limit });
	logger.info('Scoring completed', { ...result });
	return result;
};

/**
 * Scheduled: AI-score matches that were saved without a score (`POST /api/ops/score`). Same job
 * as the in-process `score-pending-matches` cron, for deployments where Trigger.dev replaces it.
 */
export const scorePendingMatchesTask = schedules.task({
	id: 'score-pending-matches',
	cron: cronOf('score-pending-matches'),
	run: async () => scorePending(scorePendingLimit()),
});

/**
 * Event task: the same scoring on demand. The API enqueues it (delayed by a few minutes) after a
 * crawl's matching pass stored matches without an AI score (MatchJobPostsToEmployeesCommandHandler),
 * so they are scored sooner than at the next scheduled run. `retry` covers a failed call to the API
 * only: scoring failures are reported in the result (`failed`) and those matches are retried by later
 * runs within MAX_SCORING_ATTEMPTS — retrying them here, seconds apart, would use up that budget
 * during a short provider outage.
 */
export const scoreMatchesTask = task({
	id: TRIGGER_TASKS.scoreMatches,
	retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 30000 },
	run: async (payload: { limit?: number }) => scorePending(payload.limit ?? 50),
});

/** The all-zero UUID the application endpoint treats as "not known yet" for the ids it derives itself. */
export const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Event task: run the application pipeline for one match on behalf of a tenant
 * (`POST /api/employee/job/application/process`, tenant API key): generates the proposal when
 * none is given, creates the EmployeeJobApplication and, when it is complete (see
 * `automationTaskQueued` / `automationTaskBlockers` in the response), the automation task.
 *
 * The endpoint validates `employeeId`, `jobPostId` and `employeeJobPostId` as UUIDs; pass the
 * all-zero `UNKNOWN_ID` for `jobPostId` / `employeeJobPostId` when the job post should be found by
 * `providerJobId` (or created from `jobPost`) and the match looked up or created by the endpoint.
 */
export const processApplicationTask = task({
	id: TRIGGER_TASKS.processApplication,
	// No automatic retries: the endpoint has no idempotency key yet, so a retry after a lost response
	// would create a second application and a second apply_job automation task. Re-trigger by hand
	// after checking the application does not exist.
	retry: { maxAttempts: 1 },
	run: async (payload: {
		employeeId: string;
		jobPostId: string;
		employeeJobPostId: string;
		providerCode: string;
		providerJobId: string;
		/** Needed when the job post is not known yet (looked up by providerJobId); `title` is required by the entity. */
		jobPost?: { providerJobId: string; title: string; description?: string; skills?: string; category?: string; providerCode?: string };
		proposal?: string;
		isProposalGeneratedByAI?: boolean;
	}) => {
		if (payload.jobPost && !payload.jobPost.title) {
			throw new Error('jobPost.title is required when the job post has to be created');
		}
		const body = {
			...payload,
			jobPostId: payload.jobPostId || UNKNOWN_ID,
			employeeJobPostId: payload.employeeJobPostId || UNKNOWN_ID,
			// the entity requires providerCode on the job post; the top-level one is the same provider
			jobPost: payload.jobPost ? { providerCode: payload.providerCode, ...payload.jobPost } : undefined,
		};
		logger.info('Processing application', { employeeId: body.employeeId, providerJobId: body.providerJobId });
		const result = await callApi<{ id: string }>('/api/employee/job/application/process', body, tenantHeaders());
		logger.info('Application processed', { applicationId: result?.id });
		return result;
	},
});
