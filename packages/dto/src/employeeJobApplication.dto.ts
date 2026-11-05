
import { ID, ObjectType, GraphQLISODateTime, Field, InputType } from '@nestjs/graphql';
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
	FilterableRelation
} from '@ptc-org/nestjs-query-graphql';
import {
	IsBoolean,
	IsJSON,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';
import { TenantBaseDTO } from '@packages/core/dto/tenant-base.dto';
import {
	CreateManyByTenantHook,
	CreateOneByTenantHook,
	DeleteManyByTenantHook,
	FindManyByTenantHook,
	UpdateManyByTenantHook,
	UpdateOneByTenantHook
} from '@packages/core/hooks';
import { EmployeeDTO } from './employee.dto';
import { JobPostDTO } from './jobPost.dto';
import { EmployeeJobPostDTO } from './employeeJobPost.dto';
import { TenantAuthorizer } from '@packages/tenant/tenant.authorizer';

@ObjectType('EmployeeJobApplication')
@Authorize(TenantAuthorizer)
@FilterableRelation('employee', () => EmployeeDTO, { nullable: true })
@FilterableRelation('jobPost', () => JobPostDTO, { nullable: true })
@FilterableRelation('employeeJobPost', () => EmployeeJobPostDTO, {
	nullable: true
})
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook)
@BeforeCreateMany(CreateManyByTenantHook)
@BeforeUpdateOne(UpdateOneByTenantHook)
@BeforeUpdateMany(UpdateManyByTenantHook)
@BeforeDeleteMany(DeleteManyByTenantHook)
export class EmployeeJobApplicationDTO extends TenantBaseDTO implements IBaseDTO {
	@FilterableField(() => ID, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsUUID()
	id?: string;

	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsUUID()
	employeeJobPostId: string;

	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsUUID()
	employeeId: string;

	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsUUID()
	jobPostId: string;

	// Date when Job was created e.g. '2014-06-30T23:50:17+0000'
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@IsOptional()
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
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
	@IsString()
	@IsOptional()
	providerJobId?: string;

	// Job Application Id in provider (e.g. Upwork),
	// for example it's 1641355285024280577 for proposal link https://www.upwork.com/ab/proposals/1641355285024280577
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	providerJobApplicationId?: string;

	@FilterableField(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	isViewedByClient?: boolean;

	// Date when proposal was sent for Job, e.g. '2014-06-30T23:50:17+0000'
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@IsOptional()
	appliedDate?: Date;

	/**
	 * Job Application Status, e.g. 'succeed', 'failed', etc.
	 */
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	appliedStatus?: string;

	/**
	 * Proposal text (Cover Letter)
	 */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	proposal?: string;

	/**
	 * Is proposal generated from template by AI?
	 */
	@Field(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsBoolean()
	@IsOptional()
	isProposalGeneratedByAI?: boolean;

	/**
	 * Proposal Template used to build proposal
	 */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	proposalTemplate?: string;

	/**
	 * Questions and Answers as JSON string, e.g.
	 * [
	 *  {
	 * 		"q": "Describe your recent experience with similar projects",
	 * 		"a": "I have been working on similar projects for the last 5 years."
	 * 	},
	 *  {
	 * 		"q": "What is your availability?",
	 * 		"a": "I am available 40 hours per week."
	 * 	}
	 * ]
	 */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsJSON()
	@IsOptional()
	qa?: string;

	/**
	 * Proposal attachments as array of URLs in JSON string, e.g.
	 * [
	 * 	"https://www.example.com/attachment1.pdf","https://www.example.com/attachment2.pdf"
	 * ]
	 */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsJSON()
	@IsOptional()
	attachments?: string;

	/**
	 * Hourly Rate
	 */
	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsNumber()
	@IsOptional()
	rate?: number;

	/**
	 * Terms for fixed cost proposals.
	 * Example for Milestone:
	 * {
	 *   	type: 'milestone',
	 *   	description: '3 hours of consulting',
	 *   	amount: 5000,
	 *   	duration: "3 to 6 months"
	 * }
	 * Example for Project:
	 * {
	 * 		type: 'project',
	 *		amount: 5000,
	 *		duration: "3 to 6 months"
	 * }
	 */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsJSON()
	@IsOptional()
	terms?: string;

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
	@FilterableField({ nullable: false })
	@ApiProperty({ type: Boolean, default: true })
	isActive: boolean;

	// Indicate if record is archived
	@FilterableField({ nullable: false })
	@ApiProperty({ type: Boolean, default: false })
	isArchived: boolean;
}
