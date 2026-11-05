import type { TriggerConfig } from '@trigger.dev/sdk/v3';

/**
 * Trigger.dev project configuration.
 *
 * This file configures Trigger.dev Cloud for production scheduled jobs.
 * In development, cron-based CrawlerService is used instead.
 *
 * @see https://trigger.dev/docs/config/config-file
 */
export const config: TriggerConfig = {
	project: 'gauzy-ai',
	logLevel: 'log',
	maxDuration: 300,
	retries: {
		enabledInDev: false,
		default: {
			maxAttempts: 3,
			minTimeoutInMs: 1000,
			maxTimeoutInMs: 10000,
			factor: 2,
		},
	},
	dirs: ['./src/trigger'],
};
