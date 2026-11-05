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

/**
 * Automation Task (Command to be executed by automation system)
 *
 * This entity is generic and reusable for any type of automation task.
 * Task-specific details (e.g. job post info, provider codes) are stored
 * as serialized JSON in the `command` field.
 */
@Entity('automation_task')
export class AutomationTask extends TenantOrganizationBaseEntity {

	// ID of Tenant in the client (external) system, e.g. in Gauzy
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	externalTenantId?: string;

	// ID of Organization in the client (external) system, e.g. in Gauzy
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	externalOrgId?: string;

	/**
	 * Is that task broadcasted to all employees? By default each task belong to specific employee only
	 */
	@ApiPropertyOptional({ type: Boolean })
	@IsBoolean()
	@Index()
	@Column({ nullable: false, default: false })
	isBroadcast: boolean;

	/**
	 * Command type, e.g. 'login', 'apply_job', 'getJob', 'getJobs', 'logout', etc.
	 */
	@ApiProperty({ type: String })
	@Index()
	@Column({ nullable: false }) // each Task must have a command type
	@IsString()
	commandType: string;

	/**
	 * Command JSON representation containing all task-specific details.
	 *
	 * For job application tasks (commandType: "apply_job"):
	 * {
	 *   "commandType": "apply_job",
	 *   "providerCode": "upwork",
	 *   "providerJobId": "~aaa9992d99e35a386e",
	 *   "jobPostId": "XXXX",
	 *   "employeeJobPostId": "XXXX",
	 *   "jobType": "Hourly",
	 *   "jobStatus": "Open",
	 *   "proposal": "I am interested in your job post...",
	 *   "qa": "[{\"q\": \"...\", \"a\": \"...\"}]",
	 *   // ... other fields specific to the provider
	 * }
	 *
	 * For login tasks (commandType: "login"):
	 * {
	 *   "commandType": "login",
	 *   "providerCode": "upwork",
	 *   "username": "ruslan",
	 *   "password": "123456",
	 *   "secret": "123456"
	 * }
	 */
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@Column({ nullable: true }) // we use nullable because sometimes no need additional command details, it's enough to only know Command Type
	@IsJSON()
	command?: string;

	/**
	 * Command result JSON representation.
	 */
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@Column({ nullable: true }) // we use nullable because sometimes task did not finish or no result need to be saved
	@IsJSON()
	commandResult?: string;

	/**
	 * Task status, e.g. 'created', 'in_progress', 'completed', 'failed', etc.
	 */
	@ApiProperty({ type: String })
	@Column({ nullable: false })
	@IsString()
	status: string;

	/**
	 * Amount of Seconds it takes to execute the Task
	 */
	@ApiPropertyOptional({ type: Number })
	@Column({ nullable: true })
	@IsOptional()
	@IsNumber()
	executionTime?: number;

	/**
	 * Datetime when Task was executed
	 */
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@Column({ nullable: true })
	@IsOptional()
	executedDate?: Date;

	/*
	|--------------------------------------------------------------------------
	| @ManyToOne
	|--------------------------------------------------------------------------
	*/

	/**
	 * Employee for whom we execute task
	 */
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@RelationId((it: AutomationTask) => it.employee)
	@Index()
	@IsOptional()
	@Column({ nullable: true }) // nullable because it's possible to have tasks that can be run for any employee (or for all)
	employeeId?: Employee['id'];

	@ManyToOne(() => Employee, (employee) => employee.id, {
		/** Database cascade action on delete. */
		onDelete: 'CASCADE'
	})
	employee?: Relation<Employee>;

	/**
	 * Employee or AI Agent Id who executed task
	 */
	@ApiPropertyOptional({ type: String })
	@IsUUID()
	@RelationId((it: AutomationTask) => it.executedByEmployee)
	@Index()
	@IsOptional()
	@Column({ nullable: true }) // nullable because it's possible to have tasks that can be executed by anonymous AI Agent / human
	executedByEmployeeId?: Employee['id'];

	@ManyToOne(() => Employee, (executedByEmployee) => executedByEmployee.id)
	executedByEmployee?: Relation<Employee>;
}
