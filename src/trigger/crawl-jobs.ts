import { schedules, logger } from '@trigger.dev/sdk/v3';
import { callApi } from './api-client';
import { cronOf } from './schedule';

/**
 * Scheduled crawl of every job provider. Runs on a Trigger.dev worker and starts the crawl through
 * the API (`POST /api/crawler/crawl`, service token); the in-process scheduler runs the same job
 * with node-cron when Trigger.dev is disabled.
 *
 * The schedule comes from the same variables as the in-process cron (CRAWL_CRON or
 * CRAWL_INTERVAL_MINUTES, SCHEDULER_TIMEZONE), set in the Trigger.dev environment.
 */
export const crawlJobsTask = schedules.task({
	id: 'crawl-jobs',
	cron: cronOf('crawl'),
	run: async (payload) => {
		logger.info('Scheduled crawl', { timestamp: payload.timestamp, lastTimestamp: payload.lastTimestamp });
		await callApi('/api/crawler/crawl');
		logger.info('Scheduled crawl completed');
	},
});

/**
 * Liveness check of stale job posts (`POST /api/crawler/liveness`): verifies that jobs crawled a
 * while ago are still open and closes the ones that are gone.
 */
export const livenessCheckTask = schedules.task({
	id: 'liveness-check',
	cron: cronOf('liveness-check'),
	run: async (payload) => {
		logger.info('Scheduled liveness check', { timestamp: payload.timestamp });
		await callApi('/api/crawler/liveness');
		logger.info('Scheduled liveness check completed');
	},
});
