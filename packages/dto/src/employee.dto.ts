import {
	Field,
	ID,
	ObjectType,
	GraphQLISODateTime,
	InputType,
} from '@nestjs/graphql';
import {
	Authorize,
	BeforeCreateMany,
	BeforeCreateOne,
	BeforeDeleteMany,
	BeforeQueryMany,
	BeforeUpdateMany,
	BeforeUpdateOne,
	FilterableField,
	Relation
} from '@ptc-org/nestjs-query-graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';
import {
	CreateOneByTenantHook,
	CreateManyByTenantHook,
	UpdateOneByTenantHook,
	UpdateManyByTenantHook,
	DeleteManyByTenantHook,
	FindManyByTenantHook,
	ServerTimestampsCreateManyHook,
	ServerTimestampsCreateOneHook,
	ServerTimestampsUpdateManyHook,
	ServerTimestampsUpdateOneHook,
} from '@packages/core/hooks';
import { UserDTO } from './user.dto';
import { TenantBaseDTO } from '@packages/core/dto/tenant-base.dto';
import { TenantAuthorizer } from '@packages/tenant/tenant.authorizer';

@ObjectType('Employee')
@Authorize(TenantAuthorizer)
@InputType('EmployeeInput')
@Relation('user', () => UserDTO, {
	/** Disable remove and update because it is a virtual relation */
	remove: { enabled: false },
	update: { enabled: false },
	/** Set to true if the relation is nullable */
	nullable: true
})
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook, ServerTimestampsCreateOneHook)
@BeforeCreateMany(CreateManyByTenantHook, ServerTimestampsCreateManyHook)
@BeforeUpdateOne(UpdateOneByTenantHook, ServerTimestampsUpdateOneHook)
@BeforeUpdateMany(UpdateManyByTenantHook, ServerTimestampsUpdateManyHook)
@BeforeDeleteMany(DeleteManyByTenantHook)
export class EmployeeDTO extends TenantBaseDTO implements IBaseDTO {

	// internal ID in the Gauzy AI
	@FilterableField(() => ID, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsUUID()
	id?: string;

	// ID of Tenant in the client (external) system, e.g. in Gauzy
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	externalTenantId?: string;

	// ID of Organization in the client (external) system, e.g. in Gauzy
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	externalOrgId?: string;

	// ID of employee in the client (external) system, e.g. in Gauzy
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	externalEmployeeId?: string;

	// internal ID of user in the Gauzy AI
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsUUID()
	userId?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	firstName?: string;

	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	lastName?: string;

	@Field({ nullable: true })
	name?: string;

	// LinkedIn ID
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	linkedInId?: string;

	// "Hourly" or "Fixed". Null value indicates apply to any jobs for this search criteria
	@FilterableField(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	jobType?: string;

	/*
	|--------------------------------------------------------------------------
	| AI Scoring Enrichment Fields
	|--------------------------------------------------------------------------
	*/

	/** Professional bio / summary */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	bio?: string;

	/** Freeform skills summary (e.g. "React, TypeScript, Node.js, AWS") */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	skillsSummary?: string;

	/** Preferred hourly rate in USD */
	@Field({ nullable: true })
	@ApiPropertyOptional({ type: Number })
	@IsOptional()
	preferredRate?: number;

	/** Work history / experience summary */
	@Field(() => String, { nullable: true })
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	experienceSummary?: string;

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
	@IsBoolean()
	isActive: boolean;

	// Indicate if record is archived
	@FilterableField(() => Boolean, { nullable: false })
	@ApiProperty({ type: Boolean, default: false })
	@IsBoolean()
	isArchived: boolean;
}
