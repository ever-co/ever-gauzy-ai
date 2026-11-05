import { Entity, Column, Index, Unique } from 'typeorm';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Base } from '@packages/core/entities/base';
import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

@Entity('job_post')
@Unique(['providerCode', 'providerJobId'])
export class JobPost extends Base {
	// Provider name for Job, e.g. 'upwork' or 'linkedin' (always lowercase)
	@ApiProperty({ type: String })
	@Column({ nullable: false })
	@Index()
	@IsString()
	providerCode: string;

	// Job Id in given provider (e.g. for UpWork '~aaa9992d99e35a386e')
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@Index()
	@IsString()
	@IsOptional()
	providerJobId?: string;

	// `providerCode` of the job provider that stored the post, i.e. the channel it came through:
	// 'ever-jobs' (Ever Jobs API, whatever site `providerCode` names), 'upwork' (official Upwork API).
	// `providerCode` alone cannot tell: Ever Jobs stores each post under its site code, 'upwork'
	// included. Picks the liveness verifier (JobPostService.checkLiveness); null for rows that no
	// provider stored (created through the API).
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsString()
	@IsOptional()
	ingestedBy?: string;

	// Job title
	@ApiProperty({ type: String })
	@Column({ nullable: false })
	@IsString()
	title: string;

	// Short job description (in Upwork called 'snippet')
	@ApiPropertyOptional({ type: String })
	@Column({ type: 'text', nullable: true, default: '' })
	@IsString()
	@IsOptional()
	description?: string;

	// Date when Job was created e.g. '2014-06-30T23:50:17+0000'
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@Column({ nullable: true })
	@IsOptional()
	jobDateCreated?: Date;

	// Current status of the job in provider. It can be "Open", "Completed", "Cancelled"
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	jobStatus?: string;

	// "Hourly" or "Fixed"
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	jobType?: string;

	// Job url
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	url?: string;

	// A number or range used to filter the search by jobs having a budget equal to,
	// more or less than, or within the values provided.
	// For example:
	// `1000` - the budget is equal to 1000.
	// `500-1000` - the budget `b` is 500 <= b <= 1000,
	// `1000-` - the budget is >=1000;
	// `-200` - the budget is <= 200.
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	budget?: string;

	// Job duration (e.g. "More than 6 months")
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	duration?: string;

	// Workload for the job (e.g. "30+ hrs/week")
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	workload?: string;

	// comma separated list of skills, e.g. "css, css3, database-design, database-programming"
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	skills?: string;

	@ApiPropertyOptional({ type: Boolean })
	@Column({ nullable: true })
	@IsOptional()
	@IsBoolean()
	@Index()
	contractToHire?: boolean;

	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	category?: string;

	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	subcategory?: string;

	// Client / Job country
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	country?: string;

	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	clientFeedback?: string;

	// Level of English required for this Job (e.g. Fluent or Intermediate)
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	englishLevel?: string;

	// What languages are required for this job (just a comma separated list)
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	languages?: string;

	// Number of reviews
	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	clientReviewsCount?: number;

	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	clientJobsPosted?: number;

	// Information about Client who posted job about how many hires he already have on Upwork or other platform
	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	clientPastHires?: number;

	// How many proposals already sent to this job
	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	proposalsCount?: number;

	// How many people already interviewing
	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	interviewingCount?: number;

	// How many invites already sent to this job
	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	invitesSentCount?: number;

	// How many unanswered invites exists for this job
	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	unansweredInvitesCount?: number;

	@ApiPropertyOptional({ type: Boolean })
	@Column({ nullable: true })
	@IsOptional()
	@IsBoolean()
	clientPaymentVerificationStatus?: boolean;

	// search parameters used to find this job at Upwork
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	searchCategory?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	searchCategoryId?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	searchOccupation?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	searchOccupationId?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	searchJobType?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	searchKeyword?: string;

	// ── Multi-source fields (added for Ever Jobs integration) ──

	/** Company name that posted the job */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	companyName?: string;

	/** Company website URL */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	companyUrl?: string;

	/** Whether the job is remote */
	@ApiPropertyOptional({ type: Boolean })
	@Column({ nullable: true })
	@IsOptional()
	@IsBoolean()
	isRemote?: boolean;

	/** Formatted location string (city, state, country) */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	location?: string;

	/** Structured minimum compensation amount */
	@ApiPropertyOptional({ type: Number })
	@Column({ type: 'float', nullable: true })
	@IsOptional()
	@IsNumber()
	compensationMin?: number;

	/** Structured maximum compensation amount */
	@ApiPropertyOptional({ type: Number })
	@Column({ type: 'float', nullable: true })
	@IsOptional()
	@IsNumber()
	compensationMax?: number;

	/** Compensation currency code (e.g., "USD") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	compensationCurrency?: string;

	/** Compensation interval: "hourly", "yearly", "fixed", etc. */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	compensationInterval?: string;

	/** Direct application or source URL */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	sourceUrl?: string;

	// ── Liveness check fields ──

	/** Whether the job has been verified as expired/closed */
	@ApiPropertyOptional({ type: Boolean })
	@Column({ nullable: true, default: false })
	@IsOptional()
	@IsBoolean()
	@Index()
	isExpired?: boolean;

	/** When the liveness check was last performed */
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@Column({ nullable: true })
	@IsOptional()
	expiryCheckedAt?: Date;

	// ── Extended fields from Ever Jobs API ──

	/** Company industry vertical (e.g. "Technology", "Finance") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	companyIndustry?: string;

	/** Company logo URL */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	companyLogo?: string;

	/** Company description / about text */
	@ApiPropertyOptional({ type: String })
	@Column({ type: 'text', nullable: true })
	@IsOptional()
	@IsString()
	companyDescription?: string;

	/** Approximate number of employees (e.g. "1000-5000") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	companyNumEmployees?: string;

	/** Job listing banner image URL */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	bannerPhotoUrl?: string;

	/** Seniority level (e.g. "Mid-Senior level", "Entry level") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	@Index()
	jobLevel?: string;

	/** Job function area (e.g. "Engineering", "Marketing") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	jobFunction?: string;

	/** Department within the company */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	department?: string;

	/** Team within the department */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	team?: string;

	/** ATS platform type (e.g. "greenhouse", "lever") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	atsType?: string;

	/** Job ID from the ATS platform */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	atsId?: string;

	/** Employment type from ATS (e.g. "Full-Time", "Part-Time") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	employmentType?: string;

	/** Required experience range (e.g. "3-5 years") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	experienceRange?: string;

	/** Listing type (e.g. "featured", "sponsored", "organic") */
	@ApiPropertyOptional({ type: String })
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	listingType?: string;

	/** Company rating from review sites (e.g. Glassdoor rating) */
	@ApiPropertyOptional({ type: Number })
	@Column({ type: 'float', nullable: true })
	@IsOptional()
	@IsNumber()
	companyRating?: number;
}
