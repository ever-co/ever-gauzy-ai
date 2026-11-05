import { Column, Index, JoinColumn, ManyToOne, RelationId, Relation } from 'typeorm';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Base } from './base';
import { Tenant } from '@packages/entities/tenant.entity';

export abstract class TenantBaseEntity extends Base {

	@ApiPropertyOptional({ type: () => Tenant })
	@ManyToOne(() => Tenant, {
		/** Indicates if relation column value can be nullable or not. */
		nullable: true,

		/** Database cascade action on delete. */
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	tenant?: Relation<Tenant>;

	@ApiPropertyOptional({ type: () => String })
	@RelationId((it: TenantBaseEntity) => it.tenant)
	@Index()
	@Column({ nullable: true })
	tenantId?: Tenant['id'];
}
