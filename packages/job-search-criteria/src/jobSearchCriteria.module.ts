import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import { Employee, JobSearchCriterion } from '@packages/entities';
import { JobSearchCriterionDTO, UpworkJobsSearchCriterionDTO } from '@packages/dto';

/**
 * GraphQL CRUD for per-employee job search criteria.
 *
 * Exposes the canonical `jobSearchCriteria` operations and, on the same table, the
 * `upworkJobsSearchCriteria` operations the Ever Gauzy integration plugin was written against
 * (`createManyUpworkJobsSearchCriteria`, `deleteManyUpworkJobsSearchCriteria`, ...).
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([JobSearchCriterion]),
		NestjsQueryGraphQLModule.forFeature({
			// Employee repo for the ownership hooks (hooks are instantiated in this feature module)
			imports: [NestjsQueryTypeOrmModule.forFeature([JobSearchCriterion]), TypeOrmModule.forFeature([Employee])],
			resolvers: [
				{
					DTOClass: JobSearchCriterionDTO,
					EntityClass: JobSearchCriterion,
					enableTotalCount: true,
					enableAggregate: true,
				},
				{
					DTOClass: UpworkJobsSearchCriterionDTO,
					EntityClass: JobSearchCriterion,
					enableTotalCount: true,
				},
			],
		}),
	],
	exports: [TypeOrmModule],
})
export class JobSearchCriteriaModule {}
