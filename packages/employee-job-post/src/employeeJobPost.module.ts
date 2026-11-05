import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import {
	JobPost,
	EmployeeJobPost,
	Employee,
	SourceConfig,
	JobSearchCriterion,
} from '@packages/entities';
import { EmployeeJobPostController } from './employeeJobPost.controller';
import { EmployeeJobPostService } from './employeeJobPost.service';
import { EmployeeService } from '@packages/employee/employee.service';
import { JobPostService } from '@packages/jobPost/jobPost.service';
import { EmployeeJobPostCreateCommandHandler } from './handlers/employeeJobPostCreate.handler';
import { EmployeeJobPostCreatedEventHandler } from './handlers/employeeJobPostCreated.handler';
import { MatchJobPostsToEmployeesCommandHandler } from './handlers/matchJobPostsToEmployees.handler';
import { EmployeeJobPostResolver } from './resolvers/employeeJobPost.resolver';
import { EmployeeJobPostDTO } from '@packages/dto';
import config, { ConfigurationService } from '@packages/config';
import openai from '@packages/config/openai';
import { AiModule } from '@packages/ai/ai.module';
import { NovuService } from '@packages/novu';
import { TriggerModule } from '@packages/trigger/trigger.module';

export const CommandHandlers = [
	EmployeeJobPostCreateCommandHandler,
	MatchJobPostsToEmployeesCommandHandler,
];

export const EventHandlers = [
	EmployeeJobPostCreatedEventHandler
];

@Module({
	imports: [
		CqrsModule,
		AiModule,
		// MatchJobPostsToEmployeesCommandHandler enqueues score-matches when Trigger.dev is enabled
		TriggerModule,
		ConfigModule.forRoot({
			load: [config, openai],
		}),
		TypeOrmModule.forFeature([
			EmployeeJobPost,
			JobPost,
			Employee,
			SourceConfig,
			JobSearchCriterion,
		]),
		NestjsQueryGraphQLModule.forFeature({
			imports: [NestjsQueryTypeOrmModule.forFeature([EmployeeJobPost])],
			resolvers: [
				{
					DTOClass: EmployeeJobPostDTO,
					EntityClass: EmployeeJobPost,
					enableSubscriptions: true,
					delete: {
						disabled: false
					}
				},
			],
		}),
	],
	controllers: [EmployeeJobPostController],
	providers: [
		EmployeeJobPostService,
		EmployeeJobPostResolver,
		EmployeeService,
		ConfigurationService,
		NovuService,
		JobPostService,
		...CommandHandlers,
		...EventHandlers,
	],
	exports: [EmployeeJobPostService],
})
export class EmployeeJobPostModule { }
