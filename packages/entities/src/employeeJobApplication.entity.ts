import { Entity, Column, Index, ManyToOne, RelationId, Relation } from 'typeorm';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
	IsUUID,
	IsOptional,
	IsString,
	IsJSON,
	IsNumber,
	IsBoolean,
} from 'class-validator';
import { TenantOrganizationBaseEntity } from '@packages/core/entities/tenant-organization-base.entity';
import { Employee } from './employee.entity';
import { JobPost } from './jobPost.entity';
import { EmployeeJobPost } from './employeeJobPost.entity';

/**
 * Job Application (Proposal) for a specific Job Post
 */
@Entity('employee_job_application')
export class EmployeeJobApplication extends TenantOrganizationBaseEntity {
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

	// Status of the job in provider when applied. It can be "Open", "Completed", "Cancelled"
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
	@IsString()
	@IsOptional()
	providerJobId?: string;

	// Job Application Id in provider (e.g. Upwork),
	// for example it's 1641355285024280577 for proposal link https://www.upwork.com/ab/proposals/1641355285024280577
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	@IsString()
	providerJobApplicationId?: string;

	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	@IsBoolean()
	isViewedByClient?: boolean;

	// Date when proposal was sent for Job, e.g. '2014-06-30T23:50:17+0000'
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@Column({ nullable: true })
	@IsOptional()
	appliedDate?: Date;

	/**
	 * Job Application Status, e.g. 'succeed', 'failed', etc.
	 */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	appliedStatus?: string;

	/**
	 * Proposal text (Cover Letter)
	 */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	proposal?: string;

	/**
	 * Is proposal generated from template by AI?
	 */
	@ApiPropertyOptional({ type: Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
	isProposalGeneratedByAI?: boolean;

	/**
	 * Proposal Template used to build proposal
	 */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
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
	@ApiPropertyOptional({ type: String })
	@IsJSON()
	@IsOptional()
	@Column({ nullable: true })
	qa?: string;

	/**
	 * Proposal attachments as array of URLs in JSON string, e.g.
	 * [
	 * 	"https://www.example.com/attachment1.pdf","https://www.example.com/attachment2.pdf"
	 * ]
	 */
	@ApiPropertyOptional({ type: String })
	@IsJSON()
	@IsOptional()
	@Column({ nullable: true })
	attachments?: string;

	/**
	 * Hourly Rate
	 */
	@ApiPropertyOptional({ type: String })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
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
	@ApiPropertyOptional({ type: String })
	@IsJSON()
	@IsOptional()
	@Column({ nullable: true })
	terms?: string;

	// TODO: add Boost information

	/*
	|--------------------------------------------------------------------------
	| @ManyToOne
	|--------------------------------------------------------------------------
	*/

	/**
	 * Matched Employee Job Post record for which this application was created
	 */
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@RelationId((it: EmployeeJobApplication) => it.employeeJobPost)
	@Index()
	@Column()
	employeeJobPostId: string;

	/**
	 * We use Many to One because potentially we can apply few times to the same job post (not in Upwork, but in other systems)
	 */
	@ManyToOne(() => EmployeeJobPost, (employeeJobPost) => employeeJobPost.id)
	employeeJobPost?: Relation<EmployeeJobPost>;

	/**
	 * Employee who applied for a job
	 */
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@RelationId((it: EmployeeJobApplication) => it.employee)
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
	@RelationId((it: EmployeeJobApplication) => it.jobPost)
	@Index()
	@Column()
	jobPostId: string;

	@ManyToOne(() => JobPost, (jobPost) => jobPost.id)
	jobPost?: Relation<JobPost>;
}
