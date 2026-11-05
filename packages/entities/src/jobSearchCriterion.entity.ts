import { Entity, Column, Index, ManyToOne, RelationId, Relation } from 'typeorm';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { TenantOrganizationBaseEntity } from '@packages/core/entities/tenant-organization-base.entity';
import { Employee } from './employee.entity';

/**
 * Represents a job search criterion configured per employee.
 * Source-agnostic — works with any job provider via Ever Jobs API.
 */
@Entity('job_search_criterion')
export class JobSearchCriterion extends TenantOrganizationBaseEntity {
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	category?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	categoryId?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	occupation?: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	occupationId?: string;

	/** E.g. 'fixed' or 'hourly' */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	jobType: string;

	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	keyword: string;

	/** Geographic location filter (e.g. "New York", "Berlin") */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	location?: string;

	/** Country filter (e.g. "USA", "GERMANY") — matches Ever Jobs Country enum */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	country?: string;

	/** Only search for remote positions */
	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@Column({ type: 'boolean', nullable: true })
	isRemote?: boolean;

	/** Max age of listings in hours */
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	@Column({ type: 'int', nullable: true })
	hoursOld?: number;

	/*
	|--------------------------------------------------------------------------
	| @ManyToOne
	|--------------------------------------------------------------------------
	*/

	/**
	 * Employee who has this job search criterion
	 */
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@RelationId((it: JobSearchCriterion) => it.employee)
	@Index()
	@Column()
	employeeId: string;

	@ManyToOne(() => Employee, (employee) => employee.jobSearchCriteria, {
		/** Database cascade action on delete. */
		onDelete: 'CASCADE'
	})
	employee?: Relation<Employee>;
}
