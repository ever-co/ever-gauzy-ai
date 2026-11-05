import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CqrsModule } from '@nestjs/cqrs';
import { PubSub } from 'graphql-subscriptions';
import { pubSubToken } from '@ptc-org/nestjs-query-graphql';
import { ConfigurationService } from '@packages/config';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { JobPostService } from '@packages/jobPost/jobPost.service';
import { EmployeeJobPostService } from '@packages/employeeJobPost/employeeJobPost.service';
import { EmployeeService } from '@packages/employee/employee.service';
import {
	JobPost,
	Employee,
	EmployeeJobPost,
} from '@packages/entities';
import config from '@packages/config';
import openai from '@packages/config/openai';
import { NovuService } from '@packages/novu';
import { AiModule } from '@packages/ai/ai.module';

/**
 * CrawlerModule crawls jobs from every enabled job-source plugin.
 *
 * Providers are not wired here: each job source is a plugin (see docs/plugins.md and
 * src/plugins.ts) whose IJobProvider is collected under the multi-provider token by
 * PluginsModule (global), which CrawlerService and JobPostService inject.
 */
@Module({
	imports: [
		CqrsModule,
		ConfigModule.forRoot({
			load: [config, openai],
		}),
		TypeOrmModule.forFeature([
			JobPost,
			Employee,
			EmployeeJobPost,
		]),
		ScheduleModule.forRoot(),
		AiModule,
	],
	controllers: [CrawlerController],
	providers: [
		ConfigurationService,
		CrawlerService,
		JobPostService,
		EmployeeService,
		EmployeeJobPostService,
		NovuService,
		// Provide PubSub for EmployeeJobPostService's @InjectPubSub() dependency
		{
			provide: pubSubToken(),
			useValue: new PubSub(),
		},
	],
	exports: [CrawlerService],
})
export class CrawlerModule { }
