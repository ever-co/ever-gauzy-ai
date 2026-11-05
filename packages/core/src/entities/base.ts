import {
	UpdateDateColumn,
	CreateDateColumn,
	Column,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export abstract class Model {
	constructor(input?: any) {
		if (input) {
			for (const [key, value] of Object.entries(input)) {
				(this as any)[key] = value;
			}
		}
	}
}

export abstract class Base extends Model {
	// Internal generated ID in the gauzy-ai
	@ApiPropertyOptional({ type: () => String })
	@PrimaryGeneratedColumn('uuid')
	id?: string;

	// When record was created in our DB
	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@CreateDateColumn()
	createdAt?: Date;

	// When record was updated in our DB
	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@UpdateDateColumn()
	updatedAt?: Date;

	// Indicates if record is active now
	@ApiPropertyOptional({ type: Boolean, default: true })
	@Column({ nullable: false, default: true })
	isActive: boolean;

	// Indicate if record is archived
	@ApiPropertyOptional({ type: Boolean, default: false })
	@Column({ nullable: false, default: false })
	isArchived: boolean;
}
