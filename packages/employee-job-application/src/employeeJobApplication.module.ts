import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
	JobPost,
	EmployeeJobPost,
	Employee,
	EmployeeJobApplication,
	SourceConfig,
	JobSearchCriterion,
} from '@packages/entities';
import { EmployeeJobApplicationController } from './employeeJobApplication.controller';
import { EmployeeService } from '@packages/employee/employee.service';
import { JobPostService } from '@packages/jobPost/jobPost.service';
import { CqrsModule } from '@nestjs/cqrs';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import config from '@packages/config';
import { EmployeeJobApplicationService } from './employeeJobApplication.service';
import { EmployeeJobPostService } from '@packages/employeeJobPost/employeeJobPost.service';
import { EmployeeJobApplicationCreateCommandHandler } from './handlers/employeeJobApplicationCreate.handler';
import { EmployeeJobApplicationCreatedEventHandler } from './handlers/employeeJobApplicationCreated.handler';
import { EmployeeJobApplicationStatusChangedEventHandler } from './handlers/employeeJobApplicationStatusChanged.handler';
import { EmployeeJobApplicationSubscriber } from './employeeJobApplication.subscriber';
import { EmployeeJobApplicationResolver } from './resolvers/employeeJobApplication.resolver';
import { EmployeeJobApplicationDTO } from '@packages/dto';
import { AiModule } from '@packages/ai/ai.module';
import { NovuService } from '@packages/novu';
import { ConfigurationService } from '@packages/config';
import openai from '@packages/config/openai';
import { watchedColumnsQueryServiceProvider } from '@packages/core/crud';

export const CommandHandlers = [EmployeeJobApplicationCreateCommandHandler];

export const EventHandlers = [EmployeeJobApplicationCreatedEventHandler, EmployeeJobApplicationStatusChangedEventHandler];

@Module({
	imports: [
		CqrsModule,
		ConfigModule.forRoot({
			load: [config, openai],
		}),
		TypeOrmModule.forFeature([
			EmployeeJobApplication,
			EmployeeJobPost,
			JobPost,
			Employee,
			SourceConfig,
			JobSearchCriterion,
		]),
		NestjsQueryGraphQLModule.forFeature({
			imports: [
				NestjsQueryTypeOrmModule.forFeature([EmployeeJobApplication]),
			],
			// `updateManyEmployeeJobApplications` saves row by row when it writes `appliedStatus`, so
			// EmployeeJobApplicationSubscriber sees each status change
			services: [watchedColumnsQueryServiceProvider(EmployeeJobApplication, ['appliedStatus'])],
			resolvers: [
				{
					DTOClass: EmployeeJobApplicationDTO,
					EntityClass: EmployeeJobApplication,
					enableSubscriptions: true,
					delete: {
						disabled: false
					}
				},
			],
		}),
		AiModule,
	],
	controllers: [EmployeeJobApplicationController],
	providers: [
		EmployeeJobApplicationService,
		EmployeeJobApplicationResolver,
		EmployeeJobPostService,
		ConfigurationService,
		NovuService,
		EmployeeService,
		JobPostService,
		EmployeeJobApplicationSubscriber,
		...CommandHandlers,
		...EventHandlers,
	],
	exports: [
		EmployeeJobApplicationService,
		EmployeeJobPostService,
		JobPostService,
		EmployeeService,
	],
})
export class EmployeeJobApplicationModule { }
