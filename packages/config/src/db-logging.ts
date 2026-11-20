/**
 * What TypeORM logs, and where, from the environment.
 *
 * `DB_LOGGING` picks what is logged (default `error,warn`):
 *   - `false` / `none` / `off`: nothing;
 *   - `true` / `all`: every query — for debugging only, it is gigabytes a day on a busy API;
 *   - a comma list of TypeORM levels: `query`, `schema`, `error`, `warn`, `info`, `log`, `migration`.
 * TypeORM always reports migrations and slow queries (`maxQueryExecutionTime`), whatever the list says.
 *
 * `DB_LOGGER` picks where it goes (default `advanced-console`, i.e. stdout/stderr, collected with the
 * container logs): `advanced-console`, `simple-console`, `formatted-console`, `debug`, or `file`
 * (`ormlogs.log` in the working directory, for local debugging only: inside a container it grows in the
 * writable layer until the node runs out of disk).
 *
 * Pure: no Nest, the environment is a parameter (`process.env` by default) and a wrong value is an
 * error at startup rather than silently another logging setup.
 */
import type { LoggerOptions } from 'typeorm';

export type DbLoggingEnv = Record<string, string | undefined>;

/** TypeORM log levels (`LogLevel` in TypeORM). */
export const DB_LOG_LEVELS = [
	'query',
	'schema',
	'error',
	'warn',
	'info',
	'log',
	'migration',
] as const;
export type DbLogLevel = (typeof DB_LOG_LEVELS)[number];

/** TypeORM's built-in loggers, by the name its `logger` option takes. */
export const DB_LOGGERS = [
	'advanced-console',
	'simple-console',
	'formatted-console',
	'debug',
	'file',
] as const;
export type DbLoggerName = (typeof DB_LOGGERS)[number];

export const DEFAULT_DB_LOGGING: readonly DbLogLevel[] = ['error', 'warn'];
export const DEFAULT_DB_LOGGER: DbLoggerName = 'advanced-console';

const OFF = ['false', 'none', 'off', '0'];
const ALL = ['true', 'all', '1'];

/** The TypeORM `logging` option from `DB_LOGGING`. */
export function dbLogging(env: DbLoggingEnv = process.env): LoggerOptions {
	const raw = env.DB_LOGGING?.trim().toLowerCase();
	if (!raw) {
		return [...DEFAULT_DB_LOGGING];
	}
	if (OFF.includes(raw)) {
		return false;
	}
	if (ALL.includes(raw)) {
		return 'all';
	}
	const levels = raw
		.split(',')
		.map((level) => level.trim())
		.filter(Boolean);
	const unknown = levels.filter(
		(level) => !(DB_LOG_LEVELS as readonly string[]).includes(level),
	);
	if (unknown.length) {
		throw new Error(
			`Invalid DB_LOGGING "${env.DB_LOGGING}": unknown level(s) ${unknown.join(', ')}. ` +
				`Use false, all, or a comma list of ${DB_LOG_LEVELS.join(', ')}`,
		);
	}
	return [...new Set(levels)] as DbLogLevel[];
}

/** The TypeORM `logger` option from `DB_LOGGER`. */
export function dbLogger(env: DbLoggingEnv = process.env): DbLoggerName {
	const raw = env.DB_LOGGER?.trim().toLowerCase();
	if (!raw) {
		return DEFAULT_DB_LOGGER;
	}
	if (!(DB_LOGGERS as readonly string[]).includes(raw)) {
		throw new Error(
			`Invalid DB_LOGGER "${env.DB_LOGGER}": use one of ${DB_LOGGERS.join(', ')}`,
		);
	}
	return raw as DbLoggerName;
}

/** Both options, to spread into a TypeORM data source configuration. */
export function dbLoggingOptions(env: DbLoggingEnv = process.env): {
	logging: LoggerOptions;
	logger: DbLoggerName;
} {
	return { logging: dbLogging(env), logger: dbLogger(env) };
}
