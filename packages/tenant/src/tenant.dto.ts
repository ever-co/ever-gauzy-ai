import {
    ID,
    ObjectType,
    GraphQLISODateTime,
    InputType
} from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Authorize, FilterableField } from '@ptc-org/nestjs-query-graphql';
import { SelfTenantAuthorizer } from './self-tenant.authorizer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';

@ObjectType('Tenant')
@Authorize(SelfTenantAuthorizer)
@InputType('TenantInput')
export class TenantDTO implements IBaseDTO {

    // internal ID in the Gauzy AI
    @FilterableField(() => ID, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsUUID()
    id?: string;

    @FilterableField(() => String)
    @ApiProperty({ type: String })
    @IsString()
    name: string;

    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    logo: string;

    // ID of Tenant in the client (external) system, e.g. in Gauzy
    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    externalTenantId: string;

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