import { ID, ObjectType, GraphQLISODateTime, InputType } from '@nestjs/graphql';
import {
	Authorize,
	BeforeCreateMany,
	BeforeCreateOne,
	BeforeDeleteMany,
	BeforeDeleteOne,
	BeforeQueryMany,
	BeforeUpdateMany,
	BeforeUpdateOne,
	FilterableField,
} from '@ptc-org/nestjs-query-graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';
import { TenantBaseDTO } from '@packages/core/dto/tenant-base.dto';
import {
	CreateOneByTenantHook,
	CreateManyByTenantHook,
	UpdateOneByTenantHook,
	UpdateManyByTenantHook,
	DeleteManyByTenantHook,
	FindManyByTenantHook,
	ServerTimestampsCreateManyHook,
	ServerTimestampsCreateOneHook,
	ServerTimestampsUpdateManyHook,
	ServerTimestampsUpdateOneHook,
} from '@packages/core/hooks';
import { TenantAuthorizer } from '@packages/tenant/tenant.authorizer';
import {
	EmployeeOwnedCreateManyHook,
	EmployeeOwnedCreateOneHook,
	EmployeeOwnedUpdateManyHook,
	EmployeeOwnedUpdateOneHook,
} from '@packages/jobSearchCriteria/hooks/employee-owned.hook';
import {
	CriteriaDeleteManyTouchEmployeesHook,
	CriteriaUpdateManyTouchFormerOwnersHook,
	CriterionDeleteOneTouchesEmployeeHook,
	CriterionUpdateOneTouchesFormerOwnerHook,
} from '@packages/jobSearchCriteria/hooks/criteria-owner-touch.hook';

/**
 * Fields of a job search criterion. Shared by the canonical `JobSearchCriterion` type and the
 * `UpworkJobsSearchCriterion` alias kept for the Ever Gauzy integration plugin.
 */
@ObjectType('JobSearchCriterionBase', { isAbstract: true })
@InputType('JobSearchCriterionBaseInput', { isAbstract: true })
export abstract class JobSearchCriterionBaseDTO extends TenantBaseDTO implements IBaseDTO {
	@FilterableField(() => ID, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsUUID()
	id?: string;

	@FilterableField(() => ID)
	@ApiProperty({ type: String })
	@IsUUID()
	employeeId: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	keyword?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	jobType?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	category?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	categoryId?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	occupation?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	occupationId?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	location?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	country?: string;

	@FilterableField(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	isRemote?: boolean;

	@FilterableField(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsInt()
	hoursOld?: number;

	@FilterableField(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@FilterableField(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	isArchived?: boolean;

	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({ type: Date })
	@IsOptional()
	createdAt?: Date;

	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({ type: Date })
	@IsOptional()
	updatedAt?: Date;
}

/** Canonical GraphQL type for `job_search_criterion` (per-employee search criteria for every job provider). */
@ObjectType('JobSearchCriterion')
@Authorize(TenantAuthorizer)
@InputType('JobSearchCriterionInput')
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook, EmployeeOwnedCreateOneHook, ServerTimestampsCreateOneHook)
@BeforeCreateMany(CreateManyByTenantHook, EmployeeOwnedCreateManyHook, ServerTimestampsCreateManyHook)
@BeforeUpdateOne(UpdateOneByTenantHook, EmployeeOwnedUpdateOneHook, CriterionUpdateOneTouchesFormerOwnerHook, ServerTimestampsUpdateOneHook)
@BeforeUpdateMany(UpdateManyByTenantHook, EmployeeOwnedUpdateManyHook, CriteriaUpdateManyTouchFormerOwnersHook, ServerTimestampsUpdateManyHook)
@BeforeDeleteOne(CriterionDeleteOneTouchesEmployeeHook)
@BeforeDeleteMany(DeleteManyByTenantHook, CriteriaDeleteManyTouchEmployeesHook)
export class JobSearchCriterionDTO extends JobSearchCriterionBaseDTO {}

/**
 * Compatibility alias: the Ever Gauzy integration plugin (`packages/plugins/integration-ai`) still
 * calls `createManyUpworkJobsSearchCriteria` / `deleteManyUpworkJobsSearchCriteria`, the names of the
 * pre-2026 `employee_upwork_jobs_search_criterion` resolver. Same table, same tenant scoping.
 */
@ObjectType('UpworkJobsSearchCriterion')
@Authorize(TenantAuthorizer)
@InputType('UpworkJobsSearchCriterionInput')
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook, EmployeeOwnedCreateOneHook, ServerTimestampsCreateOneHook)
@BeforeCreateMany(CreateManyByTenantHook, EmployeeOwnedCreateManyHook, ServerTimestampsCreateManyHook)
@BeforeUpdateOne(UpdateOneByTenantHook, EmployeeOwnedUpdateOneHook, CriterionUpdateOneTouchesFormerOwnerHook, ServerTimestampsUpdateOneHook)
@BeforeUpdateMany(UpdateManyByTenantHook, EmployeeOwnedUpdateManyHook, CriteriaUpdateManyTouchFormerOwnersHook, ServerTimestampsUpdateManyHook)
@BeforeDeleteOne(CriterionDeleteOneTouchesEmployeeHook)
@BeforeDeleteMany(DeleteManyByTenantHook, CriteriaDeleteManyTouchEmployeesHook)
export class UpworkJobsSearchCriterionDTO extends JobSearchCriterionBaseDTO {}
