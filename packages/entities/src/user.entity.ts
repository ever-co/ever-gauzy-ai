import { ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, OneToOne, Relation } from 'typeorm';
import { Exclude } from 'class-transformer';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { TenantBaseEntity } from '@packages/core/entities/tenant-base.entity';
import { Employee } from './employee.entity';

@Entity('user')
// expression index on LOWER(email) for the case-insensitive Ever ID lookup; created by the
// AddUserEmailLowerIndex migration, not by schema sync (TypeORM cannot declare expression indexes)
@Index('IDX_user_email_lower', { synchronize: false })
export class User extends TenantBaseEntity {

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

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsEmail()
    @Index()
    @Column({ nullable: true })
    email: string;

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Index()
    @Column({ nullable: true })
    username: string;

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Exclude({ toPlainOnly: true })
    @Column({ nullable: true })
    hash: string;

    // ID of user in the client (external) system, e.g. in Gauzy
    @ApiPropertyOptional({ type: String })
    @IsString()
    @Index()
    @IsOptional()
    @Column({ nullable: true })
    externalUserId: string;

    // ID of Tenant in the client (external) system, e.g. in Gauzy
    @ApiPropertyOptional({ type: String })
    @IsOptional()
    @IsString()
    @Index()
    @Column({ nullable: true })
    externalTenantId: string;

    /**
     * Additional Property
     */
    name?: string;

    /*
    |--------------------------------------------------------------------------
    | @OneToOne
    |--------------------------------------------------------------------------
    */
    @OneToOne(() => Employee, (it: Employee) => it.user, {
        /** Database cascade action on delete. */
        onDelete: 'CASCADE'
    })
    employee?: Relation<Employee>;
}
