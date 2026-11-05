import {
    ID,
    ObjectType,
    GraphQLISODateTime,
    InputType
} from '@nestjs/graphql';
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
} from '@ptc-org/nestjs-query-graphql';
import {
	CreateOneByTenantHook,
	CreateManyByTenantHook,
	UpdateOneByTenantHook,
	UpdateManyByTenantHook,
	DeleteManyByTenantHook,
	FindManyByTenantHook,
} from '@packages/core/hooks';
import { TenantAuthorizer } from '@packages/tenant/tenant.authorizer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';

@ObjectType('TenantApiKey')
@Authorize(TenantAuthorizer)
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook)
@BeforeCreateMany(CreateManyByTenantHook)
@BeforeUpdateOne(UpdateOneByTenantHook)
@BeforeUpdateMany(UpdateManyByTenantHook)
@BeforeDeleteMany(DeleteManyByTenantHook)
@InputType('TenantApiKeyInput')
export class TenantApiKeyDTO implements IBaseDTO {

    // internal ID in the Gauzy AI
    @FilterableField(() => ID, { nullable: true })
    @IsOptional()
    @IsUUID()
    tenantId?: string;

    @FilterableField(() => ID, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsUUID()
    id?: string;

    @FilterableField(() => String)
    @ApiProperty({ type: String })
    @IsNotEmpty()
    @IsString()
    apiKey: string;

    @FilterableField(() => String)
    @ApiProperty({ type: String })
    @IsNotEmpty()
    @IsString()
    apiSecret: string;

    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    openAiSecretKey?: string;

    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    openAiOrganizationId?: string;

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
}