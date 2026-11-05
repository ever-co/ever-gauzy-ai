
import {
	Field,
	ID,
	ObjectType,
	GraphQLISODateTime,
	InputType,
} from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FilterableField } from '@ptc-org/nestjs-query-graphql';
import {
	IsBoolean,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';

@ObjectType('JobPost')
@InputType('JobPostInput')
export class JobPostDTO implements IBaseDTO {
	@FilterableField(() => ID, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@IsOptional()
	id?: string;

	// Provider name for Job, e.g. 'upwork' (always lowercase)
	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsString()
	providerCode: string;

	// Job Id in given provider (e.g. for UpWork '~aaa9992d99e35a386e')
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	providerJobId?: string;

	// Job title
	@FilterableField(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsString()
	title: string;

	// Short job description (in Upwork called 'snippet')
	@Field(() => String, { nullable: false })
	@ApiProperty({ type: String })
	@IsString()
	description: string;

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

	// Job url
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	url?: string;

	// A number or range used to filter the search by jobs having a budget equal to,
	// more or less than, or within the values provided.
	// For example:
	// `[100 TO 1000]` - the budget is between 100 and 1000;
	// `1000` - the budget is equal to 1000.
	// `500-1000` - the budget `b` is 500 <= b <= 1000,
	// `1000-` - the budget is >=1000;
	// `-200` - the budget is <= 200.
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	budget?: string;

	// Job duration (e.g. "More than 6 months")
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	duration?: string;

	// Workload for the job (e.g. "30+ hrs/week")
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	workload?: string;

	// comma separated list of skills, e.g. "css, css3, database-design, database-programming"
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	skills?: string;

	@Field(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	contractToHire?: boolean;

	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	category?: string;

	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	subcategory?: string;

	// Client / Job country
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	country?: string;

	// Feedback score for client (optional)
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	clientFeedback?: string;

	// Level of English required for this Job (e.g. Fluent or Intermediate)
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	englishLevel?: string;

	// What languages are required for this job (just a comma separated list)
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	languages?: string;

	// Number of reviews
	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	clientReviewsCount?: number;

	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	clientJobsPosted?: number;

	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	clientPastHires?: number;

	// How many proposals already sent to this job
	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	proposalsCount?: number;

	// How many people already interviewing
	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	interviewingCount?: number;

	// How many invites already sent to this job
	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	invitesSentCount?: number;

	// How many unanswered invites exists for this job
	@Field(() => Number, { nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@IsNumber()
	unansweredInvitesCount?: number;

	@FilterableField(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	clientPaymentVerificationStatus?: boolean;

	// search parameters used to find this job at Upwork

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	searchCategory?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	searchCategoryId?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	searchOccupation?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	searchOccupationId?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	searchJobType?: string;

	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	searchKeyword?: string;

	// When record was created in our DB
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@IsOptional()
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	createdAt?: Date;

	// When record was updated in our DB
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@IsOptional()
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	updatedAt?: Date;

	// Indicates if record is active now
	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: true })
	isActive: boolean;

	// Indicate if record is archived
	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: false })
	isArchived: boolean;

	// ── Liveness check fields ──

	/** Whether the job has been verified as expired/closed */
	@FilterableField(() => Boolean, { nullable: true })
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	isExpired?: boolean;

	/** When the liveness check was last performed */
	@FilterableField(() => GraphQLISODateTime, { nullable: true })
	@IsOptional()
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	expiryCheckedAt?: Date;
}
