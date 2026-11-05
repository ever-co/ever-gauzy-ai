/**
 * The platform's periodic jobs and how their schedules come out of the environment.
 *
 * One module for every scheduler — the in-process cron (`SchedulerService`), the Trigger.dev tasks
 * (`src/trigger`) and `GET /api/ops/schedule` — so they all derive the same cron expression from
 * the same variables, whichever of them runs a job. Pure: no Nest, the environment is a parameter
 * (`process.env` by default) and a wrong value is an error rather than silently another schedule.
 */
export type JobName =
	| 'crawl'
	| 'liveness-check'
	| 'score-pending-matches'
	| 'daily-digest'
	| 'cleanup-stale-tasks';

export interface JobSchedule {
	name: JobName;
	/** Five-field cron expression. */
	cron: string;
}

export type ScheduleEnv = Record<string, string | undefined>;

/** The schedules when nothing is configured. */
export const DEFAULT_SCHEDULES: Readonly<Record<JobName, string>> = {
	crawl: '*/10 * * * *',
	'liveness-check': '0 * * * *',
	'score-pending-matches': '15 * * * *',
	'daily-digest': '0 8 * * *',
	'cleanup-stale-tasks': '0 2 * * *',
};

/**
 * Cron expression for "every N minutes". Only intervals a cron schedule can express exactly are
 * accepted: whole-number divisors of 60 (every N minutes) and whole hours that divide the day
 * (every H hours). Anything else — including a fraction, which cron cannot run — throws instead of
 * silently running more or less often than configured; use the `*_CRON` variables for such schedules.
 */
export function everyMinutes(minutes: number | string): string {
	const n = Number(minutes);
	if (!Number.isInteger(n) || n < 1) {
		throw new Error(
			`Invalid interval "${minutes}" minutes: a whole number of minutes (1 or more) is required`,
		);
	}
	if (n < 60 && 60 % n === 0) {
		return `*/${n} * * * *`;
	}
	if (n % 60 === 0 && 24 % (n / 60) === 0) {
		return `0 */${n / 60} * * *`;
	}
	throw new Error(
		`An interval of ${n} minutes cannot be expressed as a cron schedule (use a divisor of 60, or whole hours dividing 24, or set the *_CRON variable with an explicit expression)`,
	);
}

/**
 * A positive number from the environment: unset or blank is the fallback; anything else that is
 * not a finite number above zero is a configuration error (a negative timeout would time out
 * everything, a fraction of a minute cannot be scheduled).
 */
export function positiveNumberVar(
	name: string,
	fallback: number,
	env: ScheduleEnv = process.env,
): number {
	const raw = env[name];
	if (raw === undefined || raw.trim() === '') return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`${name} must be a positive number (got "${raw}")`);
	}
	return n;
}

/** Like `positiveNumberVar`, for values that must be whole (row limits, minutes). */
export function positiveIntegerVar(
	name: string,
	fallback: number,
	env: ScheduleEnv = process.env,
): number {
	const n = positiveNumberVar(name, fallback, env);
	if (!Number.isInteger(n)) {
		throw new Error(`${name} must be a whole number (got "${env[name]}")`);
	}
	return n;
}

/**
 * Every job with its effective schedule: the explicit `*_CRON` variable when set, otherwise the
 * interval variable turned into a cron expression, otherwise the default.
 */
export function resolveSchedules(
	env: ScheduleEnv = process.env,
): JobSchedule[] {
	const explicit = (name: string): string | undefined =>
		env[name]?.trim() || undefined;
	return [
		{
			name: 'crawl',
			cron:
				explicit('CRAWL_CRON') ??
				everyMinutes(
					positiveIntegerVar('CRAWL_INTERVAL_MINUTES', 10, env),
				),
		},
		{
			name: 'liveness-check',
			cron:
				explicit('LIVENESS_CRON') ??
				everyMinutes(
					positiveIntegerVar(
						'LIVENESS_CHECK_INTERVAL_MINUTES',
						60,
						env,
					),
				),
		},
		{
			name: 'score-pending-matches',
			cron:
				explicit('SCORE_PENDING_CRON') ??
				DEFAULT_SCHEDULES['score-pending-matches'],
		},
		{
			name: 'daily-digest',
			cron: explicit('DIGEST_CRON') ?? DEFAULT_SCHEDULES['daily-digest'],
		},
		{
			name: 'cleanup-stale-tasks',
			cron:
				explicit('CLEANUP_CRON') ??
				DEFAULT_SCHEDULES['cleanup-stale-tasks'],
		},
	];
}

/** The effective cron expression of one job. */
export function scheduleOf(
	name: JobName,
	env: ScheduleEnv = process.env,
): string {
	return resolveSchedules(env).find((job) => job.name === name)!.cron;
}

/** IANA time zone the cron expressions are evaluated in (`SCHEDULER_TIMEZONE`); unset = the scheduler's own default. */
export function schedulerTimezone(
	env: ScheduleEnv = process.env,
): string | undefined {
	return env.SCHEDULER_TIMEZONE?.trim() || undefined;
}

/** Hours a pending automation task may stay open before the cleanup times it out (`STALE_TASK_TIMEOUT_HOURS`, default 24; fractions allowed). */
export function staleTaskTimeoutHours(env: ScheduleEnv = process.env): number {
	return positiveNumberVar('STALE_TASK_TIMEOUT_HOURS', 24, env);
}

/** Matches scored per pending-match scoring run (`SCORE_PENDING_LIMIT`, default 50). */
export function scorePendingLimit(env: ScheduleEnv = process.env): number {
	return positiveIntegerVar('SCORE_PENDING_LIMIT', 50, env);
}
