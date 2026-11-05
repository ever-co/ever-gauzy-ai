import { BadRequestException, Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@packages/core/decorators/public.decorator';
import { ServiceTokenOnlyGuard } from '@packages/auth/service-token.guard';
import { ExternalSchedulerGuard } from '@packages/plugin/external-scheduler.guard';
import { ConfigurationService } from '@packages/config';
import { OpsService } from './ops.service';
import { SchedulerService } from './scheduler.service';

const positiveNumber = (value: unknown, name: string, fallback: number): number => {
	if (value === undefined || value === null || value === '') return fallback;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`${name} must be a positive number`);
	return n;
};

/** Row limits go to SQL LIMIT: whole numbers only (a fraction fails on SQLite with a 500 instead of a 400). */
const positiveInteger = (value: unknown, name: string, fallback: number): number => {
	const n = positiveNumber(value, name, fallback);
	if (!Number.isInteger(n)) throw new BadRequestException(`${name} must be a positive integer`);
	return n;
};

/**
 * Operational endpoints for schedulers (Trigger.dev tasks, external cron, Kubernetes CronJobs).
 * They act across tenants with unscoped repositories, so the tenant guard is bypassed (@Public)
 * and the service token (`X-SERVICE-TOKEN` = `SERVICE_API_TOKEN`) is the only accepted credential:
 * a tenant API key or user token must not be able to run other tenants' jobs.
 */
@ApiTags('ops')
@ApiHeader({ name: 'X-SERVICE-TOKEN', description: 'Service token (SERVICE_API_TOKEN)', required: true })
@Controller('api/ops')
@Public()
@UseGuards(ServiceTokenOnlyGuard, ExternalSchedulerGuard)
export class OpsController {
	constructor(
		private readonly ops: OpsService,
		private readonly scheduler: SchedulerService,
		private readonly configurationService: ConfigurationService
	) {}

	@Get('schedule')
	@ApiOperation({ summary: 'The periodic jobs, their cron expressions and which scheduler runs them' })
	schedule() {
		const localCron = this.scheduler.isEnabled();
		const triggerDev = this.configurationService.triggerDevEnabled();
		const timezone = this.configurationService.schedulerTimezone();
		// the jobs and their schedules are resolved from the same variables by every scheduler
		// (ConfigurationService.schedules for the in-process cron, src/trigger for the Trigger.dev tasks,
		// which read them from the Trigger.dev deployment's environment: configure both alike)
		return {
			scheduler: localCron ? 'in-process' : triggerDev ? 'trigger-dev' : 'none',
			localCron,
			triggerDev,
			timezone: timezone ?? (localCron ? 'server local time' : triggerDev ? 'UTC (Trigger.dev default)' : 'not applicable'),
			jobs: this.configurationService.schedules(),
		};
	}

	@Post('digest')
	@HttpCode(200)
	@ApiOperation({ summary: 'Send the daily digest to every employee with activity since `since` (default: 24h)' })
	digest(@Body() body: { since?: string } = {}) {
		let since: Date | undefined;
		if (body?.since) {
			since = new Date(body.since);
			if (Number.isNaN(since.getTime())) throw new BadRequestException('since must be an ISO-8601 date');
		}
		return this.ops.sendDailyDigest(since);
	}

	@Post('cleanup-stale-tasks')
	@HttpCode(200)
	@ApiOperation({ summary: 'Time out automation tasks pending for longer than `timeoutHours` (default: STALE_TASK_TIMEOUT_HOURS)' })
	cleanupStaleTasks(@Body() body: { timeoutHours?: number } = {}) {
		return this.ops.cleanupStaleTasks(
			positiveNumber(body?.timeoutHours, 'timeoutHours', this.configurationService.staleTaskTimeoutHours())
		);
	}

	@Post('score')
	@HttpCode(200)
	@ApiOperation({ summary: 'AI-score matches saved without a score, up to `limit` (default 50)' })
	score(@Body() body: { limit?: number } = {}) {
		return this.ops.scorePendingMatches(positiveInteger(body?.limit, 'limit', this.configurationService.scorePendingLimit()));
	}
}
