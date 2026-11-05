import { schedules, logger } from '@trigger.dev/sdk/v3';
import { callApi } from './api-client';
import { cronOf } from './schedule';
import { staleTaskTimeoutHours } from '../../packages/config/src/schedules';

interface DigestResult {
	recipientCount: number;
	totalMatches: number;
	skipped: number;
}

interface CleanupResult {
	tasksTimedOut: number;
}

/**
 * Daily digest (`POST /api/ops/digest`): one Novu `daily-digest` notification per employee with
 * new matches or application activity since the previous run.
 */
export const dailyDigestTask = schedules.task({
	id: 'daily-digest',
	cron: cronOf('daily-digest'),
	run: async (payload) => {
		const since = payload.lastTimestamp?.toISOString() ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		logger.info('Daily digest', { since });
		const result = await callApi<DigestResult>('/api/ops/digest', { since });
		logger.info('Daily digest sent', { ...result });
		return result;
	},
});

/**
 * Stale automation tasks (`POST /api/ops/cleanup-stale-tasks`): tasks pending for longer than
 * `STALE_TASK_TIMEOUT_HOURS` (default 24, fractions allowed) are marked as timed out.
 */
export const cleanupStaleTasksTask = schedules.task({
	id: 'cleanup-stale-tasks',
	cron: cronOf('cleanup-stale-tasks'),
	run: async (payload) => {
		logger.info('Stale automation task cleanup', { timestamp: payload.timestamp });
		const timeoutHours = staleTaskTimeoutHours(); // same parsing as the API (fractions allowed)
		const result = await callApi<CleanupResult>('/api/ops/cleanup-stale-tasks', { timeoutHours });
		logger.info('Stale task cleanup completed', { ...result });
		return result;
	},
});
