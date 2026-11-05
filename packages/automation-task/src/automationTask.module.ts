import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
	JobPost,
	EmployeeJobPost,
	Employee,
	EmployeeJobApplication,
	AutomationTask,
	SourceConfig,
	JobSearchCriterion,
} from '@packages/entities';
import { AutomationTaskController } from './automationTask.controller';
import { EmployeeService } from '@packages/employee/employee.service';
import { JobPostService } from '@packages/jobPost/jobPost.service';
import { CqrsModule } from '@nestjs/cqrs';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import config, { ConfigurationService } from '@packages/config';
import { AutomationTaskService } from './automationTask.service';
import { EmployeeJobPostService } from '@packages/employeeJobPost/employeeJobPost.service';
import { AutomationTaskCreateCommandHandler } from './handlers/automationTaskCreate.handler';
import { AutomationTaskCreatedEventHandler } from './handlers/automationTaskCreated.handler';
import { AutomationTaskFinishedEventHandler } from './handlers/automationTaskFinished.handler';
import { AutomationTaskSubscriber } from './automationTask.subscriber';
import { AutomationTaskResolver } from './resolvers/automationTask.resolver';
import { AutomationTaskDTO } from '@packages/dto';
import { EmployeeJobApplicationService } from '@packages/employeeJobApplication/employeeJobApplication.service';
import { AiModule } from '@packages/ai/ai.module';
import { NovuService } from '@packages/novu';
import { watchedColumnsQueryServiceProvider } from '@packages/core/crud';
import openai from '@packages/config/openai';

export const CommandHandlers = [AutomationTaskCreateCommandHandler];

export const EventHandlers = [AutomationTaskCreatedEventHandler, AutomationTaskFinishedEventHandler];

@Module({
	imports: [
		CqrsModule,
		ConfigModule.forRoot({
			load: [config, openai],
		}),
		TypeOrmModule.forFeature([
			AutomationTask,
			EmployeeJobApplication,
			EmployeeJobPost,
			JobPost,
			Employee,
			SourceConfig,
			JobSearchCriterion,
		]),
		NestjsQueryGraphQLModule.forFeature({
			imports: [NestjsQueryTypeOrmModule.forFeature([AutomationTask])],
			// `updateManyAutomationTasks` saves row by row when it writes `status`, so AutomationTaskSubscriber sees each transition
			services: [watchedColumnsQueryServiceProvider(AutomationTask, ['status'])],
			resolvers: [
				{
					DTOClass: AutomationTaskDTO,
					EntityClass: AutomationTask,
					enableSubscriptions: true,
					delete: {
						disabled: false
					}
				},
			],
		}),
		AiModule,
	],
	controllers: [AutomationTaskController],
	providers: [
		ConfigurationService,
		AutomationTaskService,
		AutomationTaskResolver,
		EmployeeJobApplicationService,
		EmployeeJobPostService,
		EmployeeService,
		JobPostService,
		NovuService,
		AutomationTaskSubscriber,
		...CommandHandlers,
		...EventHandlers,
	],
	exports: [AutomationTaskService],
})
export class AutomationTaskModule { }
