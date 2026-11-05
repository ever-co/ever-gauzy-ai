import { Column, Entity, Index } from 'typeorm';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantBaseEntity } from '@packages/core/entities/tenant-base.entity';

@Entity('organization')
export class Organization extends TenantBaseEntity {
	// The name or title of the organization.
	@ApiPropertyOptional({ type: () => String })
	@Index()
	@Column()
	name: string;

	// ID of Organization in the client (external) system, e.g. in Gauzy
	@ApiPropertyOptional({ type: String })
	@Index()
	@Column({ nullable: true })
	externalOrgId: string;
}
