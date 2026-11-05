/**
 * Ids of the Trigger.dev event tasks the API enqueues with `TriggerService.trigger()`. Shared with
 * the task definitions in `src/trigger/` (imported by relative path there, so keep this file free of
 * NestJS imports).
 */
export const TRIGGER_TASKS = {
	/** `POST /api/ops/score`: AI-scores matches stored without a score (src/trigger/ai-scoring.ts). */
	scoreMatches: 'score-matches',
	/** `POST /api/employee/job/application/process` for one match (src/trigger/ai-scoring.ts). */
	processApplication: 'process-application',
} as const;
