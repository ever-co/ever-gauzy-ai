import { Entity, Column, Index, OneToMany, Unique, OneToOne, JoinColumn, RelationId, Relation } from 'typeorm';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { TenantOrganizationBaseEntity } from '@packages/core/entities/tenant-organization-base.entity';
import { User } from './user.entity';
import { JobSearchCriterion } from './jobSearchCriterion.entity';

@Entity('employee')
@Unique(['tenantId', 'orgId', 'firstName', 'lastName'])
export class Employee extends TenantOrganizationBaseEntity {
	// ID of Tenant in the client (external) system, e.g. in Gauzy
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Index({ unique: false })
	@Column({ nullable: true })
	externalTenantId?: string;

	// ID of Organization in the client (external) system, e.g. in Gauzy
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Index({ unique: false })
	@Column({ nullable: true })
	externalOrgId?: string;

	// ID of employee in the client (external) system, e.g. in Gauzy
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Index()
	@Column({ nullable: true })
	externalEmployeeId?: string;

	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Index()
	@Column({ nullable: true })
	firstName?: string;

	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Index()
	@Column({ nullable: true })
	lastName?: string;

	// LinkedIn ID
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Index()
	@Column({ nullable: true })
	linkedInId?: string;

	// "Hourly" or "Fixed". Null value indicates apply to any jobs are acceptable for this employee
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	jobType?: string;

	/*
	|--------------------------------------------------------------------------
	| AI Scoring Enrichment Fields
	|--------------------------------------------------------------------------
	*/

	/** Professional bio / summary */
	@ApiPropertyOptional({ type: String, description: 'Professional bio/summary for AI scoring' })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	bio?: string;

	/** Freeform skills summary (e.g. "React, TypeScript, Node.js, AWS") */
	@ApiPropertyOptional({ type: String, description: 'Comma-separated skills summary' })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	skillsSummary?: string;

	/** Preferred hourly rate in USD */
	@ApiPropertyOptional({ type: Number, description: 'Preferred hourly rate (USD)' })
	@IsOptional()
	@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
	preferredRate?: number;

	/** Work history / experience summary */
	@ApiPropertyOptional({ type: String, description: 'Experience summary for AI scoring' })
	@IsOptional()
	@IsString()
	@Column({ type: 'text', nullable: true })
	experienceSummary?: string;

	/** Flexible custom fields (JSONB for PostgreSQL, simple-json for SQLite) */
	@ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Custom key-value fields (JSON)' })
	@IsOptional()
	@Column({ type: 'simple-json', nullable: true, default: '{}' })
	customFields?: Record<string, any>;

	/**
	 * Additional Property
	 */
	name?: string;
	/*
	|--------------------------------------------------------------------------
	| @OneToOne
	|--------------------------------------------------------------------------
	*/
	@OneToOne(() => User, (it) => it.employee, {
		/** Indicates if relation column value can be nullable or not. */
		nullable: true,

		/** Database cascade action on delete. */
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	user?: Relation<User>;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsUUID()
	@RelationId((it: Employee) => it.user)
	@Index()
	@Column({ nullable: true })
	userId?: string;

	/*
	|--------------------------------------------------------------------------
	| @OneToMany
	|--------------------------------------------------------------------------
	*/
	@OneToMany(() => JobSearchCriterion, (criterion) => criterion.employee)
	jobSearchCriteria?: Relation<JobSearchCriterion[]>;
}

