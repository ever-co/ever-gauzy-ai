import { ID, ObjectType, GraphQLISODateTime, Field } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	Authorize,
	BeforeCreateMany,
	BeforeCreateOne,
	BeforeDeleteMany,
	BeforeQueryMany,
	BeforeUpdateMany,
	BeforeUpdateOne,
	FilterableField,
	FilterableRelation,
} from '@ptc-org/nestjs-query-graphql';
import {
	IsBoolean,
	IsJSON,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import {
	FindManyByTenantHook,
	CreateOneByTenantHook,
	CreateManyByTenantHook,
	UpdateOneByTenantHook,
	UpdateManyByTenantHook,
	DeleteManyByTenantHook
} from '@packages/core/hooks';
import { IBaseDTO } from '@packages/core/dto/base.dto';
import { TenantBaseDTO } from '@packages/core/dto/tenant-base.dto';
import { EmployeeDTO } from './employee.dto';
import { TenantAuthorizer } from '@packages/tenant/tenant.authorizer';

@ObjectType('AutomationTask')
@Authorize(TenantAuthorizer)
@FilterableRelation('employee', () => EmployeeDTO, { nullable: true })
@FilterableRelation('executedByEmployee', () => EmployeeDTO, { nullable: true })
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook)
@BeforeCreateMany(CreateManyByTenantHook)
@BeforeUpdateOne(UpdateOneByTenantHook)
@BeforeUpdateMany(UpdateManyByTenantHook)
@BeforeDeleteMany(DeleteManyByTenantHook)
export class AutomationTaskDTO extends TenantBaseDTO implements IBaseDTO {
	@FilterableField(() => ID, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsUUID()
	id?: string;

	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: false })
	@IsOptional()
	@IsBoolean()
	isBroadcast: boolean;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsUUID()
	employeeId?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsUUID()
	executedByEmployeeId?: string;

	/**
	 * Command type, e.g. 'login', 'apply_job', 'getJob', 'getJobs', 'logout', etc.
	 */
	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsString()
	commandType: string;

	/**
	 * Command JSON representation containing all task-specific details.
	 * For job application tasks, this includes providerCode, jobPostId,
	 * employeeJobPostId, proposal, qa, etc.
	 */
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsJSON()
	@Field(() => String, { nullable: true })
	command?: string;

	/**
	 * Command result JSON representation.
	 */
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsJSON()
	@Field(() => String, { nullable: true })
	commandResult?: string;

	/**
	 * Task status, e.g. 'created', 'in_progress', 'completed', 'failed', etc.
	 */
	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsString()
	status: string;

	/**
	 * Amount of Seconds it take to execute task
	 */
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	@Field(() => Number, { nullable: true })
	executionTime?: number;

	/**
	 * Datetime when Task was executed
	 */
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@IsOptional()
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	executedDate?: Date;

	// When record was created in our DB
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@IsOptional()
	createdAt?: Date;

	// When record was updated in our DB
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@IsOptional()
	updatedAt?: Date;

	/**
	 *  Indicates if record is active now.
	 *  This field will be used to mark record as processed and not to process it again.
	 */
	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: true })
	@IsOptional()
	@IsBoolean()
	isActive: boolean;

	/**
	 * Indicate if record is archived
	 *  This field will be used to mark record as processed/archived and not to process it again.
	 */
	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: false })
	@IsOptional()
	@IsBoolean()
	isArchived: boolean;
}

