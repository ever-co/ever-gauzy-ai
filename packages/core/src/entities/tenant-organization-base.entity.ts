import { Column, Index, JoinColumn, ManyToOne, RelationId, Relation } from 'typeorm';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantBaseEntity } from './tenant-base.entity';
import { Organization } from '@packages/entities/organization.entity';

export abstract class TenantOrganizationBaseEntity extends TenantBaseEntity {

	@ApiPropertyOptional({ type: () => Organization })
	@ManyToOne(() => Organization, {
		/** Indicates if relation column value can be nullable or not. */
		nullable: true,

		/** Database cascade action on delete. */
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	org?: Relation<Organization>;

	@ApiPropertyOptional({ type: () => String })
	@RelationId((it: TenantOrganizationBaseEntity) => it.org)
	@Index()
	@Column({ nullable: true })
	orgId?: Organization['id'];
}
