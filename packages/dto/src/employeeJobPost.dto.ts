import { ID, ObjectType, GraphQLISODateTime, InputType, Field, Float } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional as IsOptionalValidator } from 'class-validator';
import {
	Authorize,
	BeforeCreateMany,
	BeforeCreateOne,
	BeforeDeleteMany,
	BeforeQueryMany,
	BeforeUpdateMany,
	BeforeUpdateOne,
	FilterableField,
	FilterableRelation
} from '@ptc-org/nestjs-query-graphql';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';
import { TenantBaseDTO } from '@packages/core/dto/tenant-base.dto';
import {
	FindManyByTenantHook,
	CreateOneByTenantHook,
	CreateManyByTenantHook,
	UpdateOneByTenantHook,
	UpdateManyByTenantHook,
	DeleteManyByTenantHook
} from '@packages/core/hooks';
import { EmployeeDTO } from './employee.dto';
import { JobPostDTO } from './jobPost.dto';
import { TenantAuthorizer } from '@packages/tenant/tenant.authorizer';

@ObjectType('EmployeeJobPost')
@Authorize(TenantAuthorizer)
@InputType('EmployeeJobPostInput')
@FilterableRelation('employee', () => EmployeeDTO, {
	// disable remove and update because it is a virtual relation
	remove: { enabled: false },
	update: { enabled: false },
	nullable: true,
})
@FilterableRelation('jobPost', () => JobPostDTO, {
	// disable remove and update because it is a virtual relation
	remove: { enabled: false },
	update: { enabled: false },
	nullable: true,
})
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook)
@BeforeCreateMany(CreateManyByTenantHook)
@BeforeUpdateOne(UpdateOneByTenantHook)
@BeforeUpdateMany(UpdateManyByTenantHook)
@BeforeDeleteMany(DeleteManyByTenantHook)
export class EmployeeJobPostDTO extends TenantBaseDTO implements IBaseDTO {
	@FilterableField(() => ID, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@IsOptional()
	id?: string;

	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsUUID()
	employeeId: string;

	//
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@IsOptional()
	jobPostId?: string;

	// Date when Job was created e.g. '2014-06-30T23:50:17+0000'
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@IsOptional()
	jobDateCreated?: Date;

	// Current status of the job in provider. It can be "Open", "Completed", "Cancelled"
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	jobStatus?: string;

	// "Hourly" or "Fixed"
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	jobType?: string;

	// Provider name for Job, e.g. 'upwork' (always lowercase)
	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsString()
	providerCode: string;

	// Job Id in given provider (e.g. for UpWork '~aaa9992d99e35a386e')
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	providerJobId?: string;

	@FilterableField(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsBoolean()
	@IsOptional()
	isApplied?: boolean;

	/**
	 * Job Application Status, e.g. 'succeed', 'failed', etc.
	 */
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	appliedStatus?: string;

	// Date when proposal was sent for Job, e.g. '2014-06-30T23:50:17+0000'
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@IsOptional()
	appliedDate?: Date;

	/*
	|--------------------------------------------------------------------------
	| AI Scoring Fields
	|--------------------------------------------------------------------------
	*/

	/** AI match score (0-100) */
	@Field(() => Float, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptionalValidator()
	matchScore?: number;

	/** Skills evidence array (JSON string) */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String, description: 'Skills evidence array (JSON string)' })
	@IsOptionalValidator()
	skillsEvidence?: string;

	/** Risk flags array (JSON string) */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String, description: 'Risk flags array (JSON string)' })
	@IsOptionalValidator()
	riskFlags?: string;

	/** Budget fit assessment */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptionalValidator()
	budgetFit?: string;

	/** AI recommended action */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptionalValidator()
	recommendedAction?: string;

	/** AI explanation of match */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptionalValidator()
	explanation?: string;

	/** AI model used for scoring */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptionalValidator()
	modelUsed?: string;

	/** When AI scoring was performed */
	@Field(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({ type: 'string', format: 'date-time' })
	@IsOptionalValidator()
	scoredAt?: Date;

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

	// Indicates if record is active now
	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: true })
	isActive: boolean;

	// Indicate if record is archived
	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: false })
	isArchived: boolean;
}
