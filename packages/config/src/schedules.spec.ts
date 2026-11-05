import {
	everyMinutes,
	positiveIntegerVar,
	positiveNumberVar,
	resolveSchedules,
	scheduleOf,
	schedulerTimezone,
	scorePendingLimit,
	staleTaskTimeoutHours,
} from './schedules';

describe('schedules (periodic jobs, shared by every scheduler)', () => {
	it('turns an interval in minutes into a cron expression, and refuses intervals cron cannot express', () => {
		expect(everyMinutes(10)).toBe('*/10 * * * *');
		expect(everyMinutes(1)).toBe('*/1 * * * *');
		expect(everyMinutes(60)).toBe('0 */1 * * *');
		expect(everyMinutes(180)).toBe('0 */3 * * *');
		expect(() => everyMinutes(45)).toThrow(/cannot be expressed/); // :00 and :45 would leave a 15-minute gap
		expect(() => everyMinutes(90)).toThrow(/cannot be expressed/); // would silently become hourly
		expect(() => everyMinutes(0)).toThrow(/Invalid interval/);
		// fractions are not rounded to a different frequency
		expect(() => everyMinutes(10.5)).toThrow(/whole number/);
		expect(() => everyMinutes(60.5)).toThrow(/whole number/);
		expect(() => everyMinutes('abc')).toThrow(/whole number/);
	});

	it('resolves the five jobs from the defaults, the intervals or the explicit cron variables', () => {
		expect(resolveSchedules({})).toEqual([
			{ name: 'crawl', cron: '*/10 * * * *' },
			{ name: 'liveness-check', cron: '0 */1 * * *' },
			{ name: 'score-pending-matches', cron: '15 * * * *' },
			{ name: 'daily-digest', cron: '0 8 * * *' },
			{ name: 'cleanup-stale-tasks', cron: '0 2 * * *' },
		]);
		expect(scheduleOf('crawl', { CRAWL_INTERVAL_MINUTES: '30' })).toBe(
			'*/30 * * * *',
		);
		expect(
			scheduleOf('liveness-check', {
				LIVENESS_CHECK_INTERVAL_MINUTES: '120',
			}),
		).toBe('0 */2 * * *');
		// explicit expressions win over the intervals
		const explicit = resolveSchedules({
			CRAWL_INTERVAL_MINUTES: '10',
			CRAWL_CRON: '*/7 * * * *',
			LIVENESS_CRON: '30 */2 * * *',
			SCORE_PENDING_CRON: '45 * * * *',
			DIGEST_CRON: '0 9 * * 1-5',
			CLEANUP_CRON: '0 3 * * *',
		}).map((job) => job.cron);
		expect(explicit).toEqual([
			'*/7 * * * *',
			'30 */2 * * *',
			'45 * * * *',
			'0 9 * * 1-5',
			'0 3 * * *',
		]);
		// a blank variable is "unset"
		expect(scheduleOf('daily-digest', { DIGEST_CRON: '  ' })).toBe(
			'0 8 * * *',
		);
		// a bad interval is an error, never a different schedule
		expect(() =>
			resolveSchedules({ CRAWL_INTERVAL_MINUTES: '10.5' }),
		).toThrow(/CRAWL_INTERVAL_MINUTES must be a whole number/);
		expect(() =>
			resolveSchedules({ LIVENESS_CHECK_INTERVAL_MINUTES: '-5' }),
		).toThrow(/must be a positive number/);
	});

	it('reads positive numbers from the environment and rejects everything else', () => {
		expect(positiveNumberVar('X', 24, {})).toBe(24);
		expect(positiveNumberVar('X', 24, { X: '' })).toBe(24);
		expect(positiveNumberVar('X', 24, { X: '0.5' })).toBe(0.5);
		expect(() => positiveNumberVar('X', 24, { X: '-1' })).toThrow(
			/X must be a positive number \(got "-1"\)/,
		);
		expect(() => positiveNumberVar('X', 24, { X: '0' })).toThrow(
			/positive number/,
		);
		expect(() => positiveNumberVar('X', 24, { X: 'abc' })).toThrow(
			/positive number/,
		);
		expect(() => positiveNumberVar('X', 24, { X: 'Infinity' })).toThrow(
			/positive number/,
		);
		expect(positiveIntegerVar('X', 50, { X: '25' })).toBe(25);
		expect(() => positiveIntegerVar('X', 50, { X: '2.5' })).toThrow(
			/whole number/,
		);
	});

	it('exposes the thresholds both schedulers share', () => {
		expect(staleTaskTimeoutHours({})).toBe(24);
		expect(staleTaskTimeoutHours({ STALE_TASK_TIMEOUT_HOURS: '1.5' })).toBe(
			1.5,
		); // fractions allowed, same as the API
		expect(() =>
			staleTaskTimeoutHours({ STALE_TASK_TIMEOUT_HOURS: '-1' }),
		).toThrow(/STALE_TASK_TIMEOUT_HOURS/);
		expect(scorePendingLimit({})).toBe(50);
		expect(scorePendingLimit({ SCORE_PENDING_LIMIT: '10' })).toBe(10);
		expect(() =>
			scorePendingLimit({ SCORE_PENDING_LIMIT: '10.5' }),
		).toThrow(/whole number/);
		expect(schedulerTimezone({})).toBeUndefined();
		expect(schedulerTimezone({ SCHEDULER_TIMEZONE: ' ' })).toBeUndefined();
		expect(schedulerTimezone({ SCHEDULER_TIMEZONE: 'Europe/Sofia' })).toBe(
			'Europe/Sofia',
		);
	});
});
