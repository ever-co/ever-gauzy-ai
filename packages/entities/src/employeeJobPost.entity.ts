import { Entity, Column, Index, ManyToOne, Unique, RelationId, Relation } from 'typeorm';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { TenantOrganizationBaseEntity } from '@packages/core/entities/tenant-organization-base.entity';
import { IsUUID, IsBoolean, IsOptional, IsString, IsNumber } from 'class-validator';
import { Employee } from './employee.entity';
import { JobPost } from './jobPost.entity';

@Entity('employee_job_post')
@Unique(['tenantId', 'orgId', 'employeeId', 'jobPostId'])
// One match per employee ↔ job post. The constraint above does not hold when orgId is NULL (NULLs are
// distinct in PostgreSQL); matching inserts with ON CONFLICT DO NOTHING against this index.
// Created by the AddEmployeeJobPostPairUnique migration.
@Index('UQ_employee_job_post_employee_job_post', ['employeeId', 'jobPostId'], { unique: true })
export class EmployeeJobPost extends TenantOrganizationBaseEntity {
	// Date when Job was created e.g. '2014-06-30T23:50:17+0000'
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	jobDateCreated?: Date;

	// Current status of the job in provider. It can be "Open", "Completed", "Cancelled"
	@ApiPropertyOptional({ type: String })
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	@IsString()
	jobStatus?: string;

	// "Hourly" or "Fixed"
	@ApiPropertyOptional({ type: String })
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	@IsString()
	jobType?: string;

	// Provider name for Job, e.g. 'upwork' (always lowercase)
	@ApiProperty({ type: String })
	@Index()
	@Column()
	@IsString()
	providerCode: string;

	// Job Id in given provider (e.g. for UpWork '~aaa9992d99e35a386e')
	@ApiPropertyOptional({ type: String })
	@Index()
	@Column({ nullable: true })
	@IsOptional()
	@IsString()
	providerJobId?: string;

	/**
	 * True if employee applied to this job (even if it's failed, it still will be true)
	 */
	@ApiPropertyOptional({ type: Boolean })
	@IsBoolean()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	isApplied?: boolean;

	/**
	 * Job Application Status, e.g. 'succeed', 'failed', etc.
	 */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	appliedStatus?: string;

	// Date when proposal was sent for Job, e.g. '2014-06-30T23:50:17+0000'
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@Column({ nullable: true })
	@IsOptional()
	appliedDate?: Date;

	/*
	|--------------------------------------------------------------------------
	| AI Scoring Fields
	|--------------------------------------------------------------------------
	*/

	/** AI match score (0–100) */
	@ApiPropertyOptional({ type: Number, description: 'AI match score 0-100' })
	@IsNumber()
	@IsOptional()
	@Index()
	@Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
	matchScore?: number;

	/** Evidence mapping: [{required: "React", employee: "React (Expert)", match: true}] */
	@ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Skills evidence array (JSON)' })
	@IsOptional()
	@Column({ type: 'simple-json', nullable: true })
	skillsEvidence?: any;

	/** Risk flags: [{flag: "Budget Low", severity: "medium", detail: "..."}] */
	@ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Risk flags array (JSON)' })
	@IsOptional()
	@Column({ type: 'simple-json', nullable: true })
	riskFlags?: any;

	/** Budget fit assessment: "good_fit", "under_budget", "over_budget" */
	@ApiPropertyOptional({ type: String, description: 'Budget fit assessment' })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	budgetFit?: string;

	/** Recommended action: "apply_now", "ask_question", "skip", "review" */
	@ApiPropertyOptional({ type: String, description: 'AI recommended action' })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	recommendedAction?: string;

	/** Human-readable AI explanation of why this job was matched */
	@ApiPropertyOptional({ type: String, description: 'AI explanation of match' })
	@IsString()
	@IsOptional()
	@Column({ type: 'text', nullable: true })
	explanation?: string;

	/** AI model identifier used for scoring (e.g. "gpt-4", "claude-3") */
	@ApiPropertyOptional({ type: String, description: 'AI model used for scoring' })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	modelUsed?: string;

	/** Timestamp when AI scoring was performed */
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		description: 'When AI scoring was performed',
	})
	@IsOptional()
	@Column({ nullable: true })
	scoredAt?: Date;

	/** AI scoring attempts made so far (pending-match scoring gives up after a few failures) */
	@ApiPropertyOptional({ type: Number, description: 'AI scoring attempts made so far' })
	@IsOptional()
	@Column({ type: 'int', default: 0 })
	scoringAttempts?: number;

	/** When the current scoring attempt claimed this match (a stale claim is retried) */
	@ApiPropertyOptional({ type: 'string', format: 'date-time', description: 'When the current scoring attempt started' })
	@IsOptional()
	@Column({ nullable: true })
	scoringStartedAt?: Date;

	/** Error of the last failed scoring attempt */
	@ApiPropertyOptional({ type: String, description: 'Error of the last failed scoring attempt' })
	@IsOptional()
	@Column({ type: 'text', nullable: true })
	scoringError?: string;

	/*
	|--------------------------------------------------------------------------
	| @ManyToOne
	|--------------------------------------------------------------------------
	*/

	/**
	 * Employee who matched for a job post
	 */
	@ApiProperty({ type: String })
	@IsUUID()
	@RelationId((it: EmployeeJobPost) => it.employee)
	@Index()
	@Column()
	employeeId: string;

	@ManyToOne(() => Employee, (employee) => employee.id, {
		/** Database cascade action on delete. */
		onDelete: 'CASCADE'
	})
	employee?: Relation<Employee>;

	/**
	 * What job employee applied to
	 */
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@RelationId((it: EmployeeJobPost) => it.jobPost)
	@Index()
	@Column({ nullable: true })
	jobPostId?: string;

	@ManyToOne(() => JobPost, (jobPost) => jobPost.id)
	jobPost?: Relation<JobPost>;
}
