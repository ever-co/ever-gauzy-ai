import { InputType, ObjectType } from "@nestjs/graphql";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { FilterableField } from "@ptc-org/nestjs-query-graphql";
import { IsOptional, IsUUID } from "class-validator";
import { IBasePerTenantEntityModel } from "../interfaces/base-entity.model";

@ObjectType('TenantBaseDTO', { isAbstract: true })
@InputType('TenantBaseDTOInput', { isAbstract: true })
export abstract class TenantBaseDTO implements IBasePerTenantEntityModel {

	// internal Tenant ID in the Gauzy AI
	@ApiPropertyOptional({ type: String })
	@FilterableField(() => String, { nullable: true })
	@IsOptional()
	@IsUUID()
	tenantId?: string;
}