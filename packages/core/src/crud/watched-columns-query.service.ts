import { Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Class, DeepPartial, Filter, getQueryServiceToken, UpdateManyResponse } from '@ptc-org/nestjs-query-core';
import { TypeOrmQueryService } from '@ptc-org/nestjs-query-typeorm';
import { DeepPartial as TypeOrmDeepPartial, ObjectLiteral, Repository } from 'typeorm';
import { supportsRowLocks } from '../persistence/row-lock';

/**
 * nestjs-query service for an entity whose TypeORM subscriber reacts to changes of some columns
 * (a status transition that notifies a person).
 *
 * `updateMany` normally runs one bulk UPDATE, which a subscriber receives without the rows or
 * their stored values. When the update writes one of `watchedColumns`, this service instead
 * selects the matching rows inside a transaction (locking them where the database supports it)
 * and saves each one with only its id and the requested values, so the subscriber compares each
 * row's stored value with the new one and no other column is written. Updates that leave the
 * watched columns alone stay one statement; `createOne`, `createMany` and `updateOne` already
 * save entities.
 */
export class WatchedColumnsQueryService<Entity extends ObjectLiteral> extends TypeOrmQueryService<Entity> {
	constructor(
		repo: Repository<Entity>,
		private readonly watchedColumns: ReadonlyArray<keyof Entity & string>
	) {
		super(repo);
	}

	async updateMany(update: DeepPartial<Entity>, filter: Filter<Entity>): Promise<UpdateManyResponse> {
		const values = update as Record<string, unknown>;
		if (!this.watchedColumns.some((column) => values[column] !== undefined)) {
			return super.updateMany(update, filter);
		}
		if (values.id !== undefined) {
			throw new Error('Id cannot be specified when updating');
		}
		return this.repo.manager.transaction(async (manager) => {
			// the filter is evaluated inside the transaction, so a row is updated only if it still matches
			const rows = new TypeOrmQueryService(manager.getRepository(this.EntityClass)).filterQueryBuilder.select({ filter });
			rows.select(`${rows.alias}.id`);
			if (supportsRowLocks(manager)) {
				rows.setLock('pessimistic_write', undefined, [rows.alias]);
			}
			const ids = (await rows.getMany()).map((row) => (row as ObjectLiteral).id);
			for (const id of ids) {
				await manager.save(this.EntityClass, { ...update, id } as unknown as TypeOrmDeepPartial<Entity>);
			}
			return { updatedCount: ids.length };
		});
	}
}

/**
 * Replaces the nestjs-query service of `EntityClass` (the one `@InjectQueryService(EntityClass)` and
 * the auto-generated resolver receive) with a `WatchedColumnsQueryService`. List it in the
 * `services` of `NestjsQueryGraphQLModule.forFeature()`.
 */
export function watchedColumnsQueryServiceProvider<Entity extends ObjectLiteral>(
	EntityClass: Class<Entity>,
	watchedColumns: ReadonlyArray<keyof Entity & string>
): Provider {
	return {
		provide: getQueryServiceToken(EntityClass),
		useFactory: (repo: Repository<Entity>) => new WatchedColumnsQueryService(repo, watchedColumns),
		inject: [getRepositoryToken(EntityClass)],
	};
}
