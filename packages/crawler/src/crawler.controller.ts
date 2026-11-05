import { Controller, Header, Post, UseGuards } from '@nestjs/common';
import { Public } from '@packages/core/decorators/public.decorator';
import { ServiceTokenOnlyGuard } from '@packages/auth/service-token.guard';
import { ExternalSchedulerGuard } from '@packages/plugin/external-scheduler.guard';
import { CrawlerService } from './crawler.service';

/**
 * Operational endpoints for schedulers (Trigger.dev tasks, cron). A crawl loads every tenant's
 * search criteria and runs them with each tenant's own source credentials, so these endpoints act
 * across tenants: the tenant guard is bypassed (@Public) and the service token is the only accepted
 * credential (`ServiceTokenOnlyGuard`, as for `/api/ops/*`) — a tenant credential must not be able
 * to trigger other tenants' searches and AI processing.
 */
@Controller('api/crawler')
@Public()
@UseGuards(ServiceTokenOnlyGuard, ExternalSchedulerGuard)
export class CrawlerController {
	constructor(public readonly service: CrawlerService) {}

	@Post('crawl')
	@Header('Cache-Control', 'none')
	async crawl(): Promise<void> {
		return await this.service.crawl();
	}

	@Post('liveness')
	@Header('Cache-Control', 'none')
	async liveness(): Promise<void> {
		return await this.service.runLivenessChecks();
	}
}
