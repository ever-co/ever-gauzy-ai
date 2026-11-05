import { Column, Entity, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Base } from '@packages/core/entities/base';

@Entity('tenant')
export class Tenant extends Base {
	// The name or title of the tenant organization.
	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@IsString()
	@Index()
	@Column()
	name: string;

	// The logo of the tenant organization.
	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	logo: string;

	// ID of Tenant in the client (external) system, e.g. in Gauzy
	@ApiPropertyOptional({ type: String })
	@IsOptional()
	@IsString()
	@Index()
	@Column({ nullable: true })
	externalTenantId: string;
}
