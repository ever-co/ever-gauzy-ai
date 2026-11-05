import {
	JobName,
	scheduleOf,
	schedulerTimezone,
} from '../../packages/config/src/schedules';

/**
 * Declarative schedule of one of the platform's periodic jobs: the same `*_CRON` /
 * `*_INTERVAL_MINUTES` / `SCHEDULER_TIMEZONE` variables the in-process cron uses, read from the
 * Trigger.dev deployment's environment (configure it like the API's). Without a time zone the
 * Trigger.dev default (UTC) applies.
 */
export function cronOf(
	name: JobName,
): string | { pattern: string; timezone: string } {
	const timezone = schedulerTimezone();
	const pattern = scheduleOf(name);
	return timezone ? { pattern, timezone } : pattern;
}
