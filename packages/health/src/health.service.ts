import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
	private readonly logger = new Logger(HealthService.name);

	/** The database probe in flight, shared by concurrent checks (see `probeDatabase`). */
	private probe?: Promise<void>;

	constructor(private readonly dataSource: DataSource) {}

	/**
	 * One `SELECT 1` at a time: a probe that times out is still awaited by the next checks instead of
	 * each of them starting another query, so a stalled pool or network never accumulates outstanding
	 * work from repeated `/api/health` calls (the query itself cannot be cancelled through TypeORM).
	 */
	private probeDatabase(): Promise<void> {
		if (!this.probe) {
			this.probe = this.dataSource
				.query('SELECT 1')
				.then(() => undefined)
				.finally(() => {
					this.probe = undefined;
				});
		}
		return this.probe;
	}

	/**
	 * Perform a comprehensive health check.
	 *
	 * @returns Health status object with uptime, version, DB connectivity, and timestamp
	 */
	async check(): Promise<{
		status: string;
		uptime: number;
		version: string;
		dbConnected: boolean;
		timestamp: Date;
	}> {
		let dbConnected = false;

		// A stalled connection (pool exhausted, network black hole) must report `degraded`, not hang the
		// probe: the answer gets a deadline (HEALTH_DB_TIMEOUT_MS, default 3 s) while the single
		// in-flight query keeps running until it settles.
		const timeoutMs = Number(process.env.HEALTH_DB_TIMEOUT_MS) || 3000;
		let timer: NodeJS.Timeout | undefined;
		try {
			await Promise.race([
				this.probeDatabase(),
				new Promise((_, reject) => {
					timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
				}),
			]);
			dbConnected = true;
		} catch (error) {
			this.logger.warn(`Database health check failed: ${error.message}`);
		} finally {
			clearTimeout(timer);
		}

		const status = dbConnected ? 'ok' : 'degraded';

		// Read version from package.json (fallback to '0.0.0')
		let version = '0.0.0';
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const pkg = require('../../../package.json');
			version = pkg.version || '0.0.0';
		} catch {
			// Ignore — unable to read package.json
		}

		return {
			status,
			uptime: process.uptime(),
			version,
			dbConnected,
			timestamp: new Date(),
		};
	}
}
