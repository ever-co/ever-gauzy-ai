import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import config, { ConfigurationService } from '@packages/config';
import { AutomationTask, Employee, EmployeeJobApplication, EmployeeJobPost } from '@packages/entities';
import { AiModule } from '@packages/ai/ai.module';
import { CrawlerModule } from '@packages/crawler/crawler.module';
import { NovuModule } from '@packages/novu/novu.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { SchedulerService } from './scheduler.service';

/**
 * Operations: the cross-tenant maintenance jobs (`OpsService`), the service-token endpoints that
 * start them (`/api/ops/*`) and the in-process scheduler that runs them on a cron when Trigger.dev
 * does not (`SchedulerService`).
 */
@Module({
	imports: [
		// the EventBus: cleanupStaleTasks() publishes AutomationTaskFinishedEvent for the tasks it times out
		CqrsModule,
		ConfigModule.forRoot({ load: [config] }),
		TypeOrmModule.forFeature([EmployeeJobPost, EmployeeJobApplication, AutomationTask, Employee]),
		AiModule,
		CrawlerModule,
		NovuModule,
	],
	controllers: [OpsController],
	providers: [ConfigurationService, OpsService, SchedulerService],
	exports: [OpsService, SchedulerService],
})
export class OpsModule {}
