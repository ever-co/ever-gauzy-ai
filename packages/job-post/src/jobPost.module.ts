import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import { JobPost } from '@packages/entities';
import { JobPostResolver } from './resolvers/jobPost.resolver';
import { JobPostDTO } from '@packages/dto';
import { JobPostController } from './jobPost.controller';
import { JobPostService } from './jobPost.service';
import { JobPostCreateCommandHandler } from './handlers/jobPostCreate.handler';
import { JobPostCreatedEventHandler } from './handlers/jobPostCreated.handler';
import config from '@packages/config';

export const CommandHandlers = [JobPostCreateCommandHandler];
export const EventHandlers = [JobPostCreatedEventHandler];

@Module({
	imports: [
		ConfigModule.forRoot({
			load: [config],
		}),
		CqrsModule,
		TypeOrmModule.forFeature([JobPost]),
		NestjsQueryGraphQLModule.forFeature({
			imports: [NestjsQueryTypeOrmModule.forFeature([JobPost])],
			resolvers: [
				{
					DTOClass: JobPostDTO,
					EntityClass: JobPost,
					enableSubscriptions: true,
					delete: {
						disabled: false
					}
				},
			],
		}),
	],
	controllers: [JobPostController],
	providers: [
		JobPostService,
		JobPostResolver,
		...CommandHandlers,
		...EventHandlers,
	],
	exports: [JobPostService],
})
export class JobPostModule { }
