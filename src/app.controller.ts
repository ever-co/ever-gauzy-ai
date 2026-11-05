import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { HealthService } from '@packages/health/health.service';
import { Public } from '@packages/core/decorators';

@Controller('api')
@Public()
export class AppController {
	constructor(
		private readonly appService: AppService,
		private readonly healthService: HealthService
	) {
		console.log(
			`AppController initializing. Sending "ping"... Get: ${JSON.stringify(
				appService.ping()
			)}`
		);
	}

	/** Liveness/readiness probe: `status` is `ok` only when the database answers `SELECT 1` (HealthService). */
	@Get('health')
	async health(): Promise<{
		status: string;
		uptime: number;
		version: string;
		dbConnected: boolean;
		timestamp: string;
	}> {
		const result = await this.healthService.check();
		return { ...result, timestamp: result.timestamp.toISOString() };
	}

	@Get()
	get(): string {
		return 'Gauzy AI API';
	}
}
