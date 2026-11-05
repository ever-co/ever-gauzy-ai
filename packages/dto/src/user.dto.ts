import {
    ID,
    ObjectType,
    GraphQLISODateTime,
    InputType,
    Field,
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
    Relation
} from '@ptc-org/nestjs-query-graphql';
import { Exclude } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';
import { IBaseDTO } from '@packages/core/dto/base.dto';
import { TenantBaseDTO } from '@packages/core/dto/tenant-base.dto';
import { EmployeeDTO } from './employee.dto';
import {
    CreateManyByTenantHook,
    CreateOneByTenantHook,
    DeleteManyByTenantHook,
    FindManyByTenantHook,
    UpdateManyByTenantHook,
    UpdateOneByTenantHook
} from '@packages/core/hooks';
import { TenantAuthorizer } from '@packages/tenant/tenant.authorizer';

@ObjectType('User')
@Authorize(TenantAuthorizer)
@InputType('UserInput')
@Relation('employee', () => EmployeeDTO, {
    /** Disable remove and update because it is a virtual relation */
    remove: { enabled: false },
    update: { enabled: false },
    /** Set to true if the relation is nullable */
    nullable: true
})
@BeforeQueryMany(FindManyByTenantHook)
@BeforeCreateOne(CreateOneByTenantHook)
@BeforeCreateMany(CreateManyByTenantHook)
@BeforeUpdateOne(UpdateOneByTenantHook)
@BeforeUpdateMany(UpdateManyByTenantHook)
@BeforeDeleteMany(DeleteManyByTenantHook)
export class UserDTO extends TenantBaseDTO implements IBaseDTO {

    // internal ID in the Gauzy AI
    @FilterableField(() => ID, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsUUID()
    id?: string;

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

    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    username: string;

    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsEmail()
    email: string;

    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    @Exclude({ toPlainOnly: true })
    hash: string;

    // ID of Tenant in the client (external) system, e.g. in Gauzy
    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    externalTenantId: string;

    // ID of user in the client (external) system, e.g. in Gauzy
    @FilterableField(() => String, { nullable: true })
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    externalUserId: string;

    // Indicates if record is active now
    @FilterableField(() => Boolean, { nullable: false })
    @ApiProperty({ type: Boolean, default: true })
    @IsOptional()
    @IsBoolean()
    isActive: boolean;

    // Indicate if record is archived
    @FilterableField(() => Boolean, { nullable: false })
    @ApiProperty({ type: Boolean, default: false })
    @IsOptional()
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