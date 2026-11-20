import {
	DEFAULT_DB_LOGGER,
	DEFAULT_DB_LOGGING,
	dbLogger,
	dbLogging,
	dbLoggingOptions,
} from './db-logging';

describe('db-logging (TypeORM logging from DB_LOGGING / DB_LOGGER)', () => {
	it('logs errors and warnings to the console when nothing is configured', () => {
		expect(dbLoggingOptions({})).toEqual({
			logging: ['error', 'warn'],
			logger: 'advanced-console',
		});
		expect(dbLoggingOptions({ DB_LOGGING: '', DB_LOGGER: ' ' })).toEqual({
			logging: [...DEFAULT_DB_LOGGING],
			logger: DEFAULT_DB_LOGGER,
		});
	});

	it('never writes a query log file unless DB_LOGGER=file is asked for', () => {
		expect(dbLogger({})).not.toBe('file');
		expect(dbLogger({ DB_LOGGING: 'all' })).not.toBe('file');
		expect(dbLogger({ DB_LOGGER: 'file' })).toBe('file');
	});

	it('switches logging off or on for every query', () => {
		for (const off of ['false', 'none', 'off', '0', 'FALSE']) {
			expect(dbLogging({ DB_LOGGING: off })).toBe(false);
		}
		for (const all of ['true', 'all', '1', 'ALL']) {
			expect(dbLogging({ DB_LOGGING: all })).toBe('all');
		}
	});

	it('takes a comma list of TypeORM levels', () => {
		expect(dbLogging({ DB_LOGGING: 'error' })).toEqual(['error']);
		expect(
			dbLogging({ DB_LOGGING: ' query , error,schema,error ' }),
		).toEqual(['query', 'error', 'schema']);
		expect(() => dbLogging({ DB_LOGGING: 'error,verbose' })).toThrow(
			/Invalid DB_LOGGING "error,verbose": unknown level\(s\) verbose/,
		);
	});

	it('takes any TypeORM built-in logger by name and refuses others', () => {
		expect(dbLogger({ DB_LOGGER: 'simple-console' })).toBe(
			'simple-console',
		);
		expect(dbLogger({ DB_LOGGER: 'Formatted-Console' })).toBe(
			'formatted-console',
		);
		expect(dbLogger({ DB_LOGGER: 'debug' })).toBe('debug');
		expect(() => dbLogger({ DB_LOGGER: 'stdout' })).toThrow(
			/Invalid DB_LOGGER "stdout"/,
		);
	});
});
