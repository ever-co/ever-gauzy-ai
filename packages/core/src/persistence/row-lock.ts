import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

/** TypeORM drivers that support `SELECT ... FOR UPDATE` (`pessimistic_write`). */
const ROW_LOCK_DRIVERS: ReadonlySet<string> = new Set(['postgres', 'cockroachdb', 'mysql', 'mariadb', 'mssql', 'oracle']);

/**
 * Whether the database behind `manager` supports row locks. SQLite (`sqlite`, `sqljs`) has none:
 * it serializes writers itself, and a lock request would fail there.
 */
export const supportsRowLocks = (manager: EntityManager): boolean => ROW_LOCK_DRIVERS.has(manager.dataSource.options.type);

/** `lock` option for a `find` that must lock the rows it reads (nothing where row locks are not supported). */
export const rowLockOption = (manager: EntityManager): { lock?: { mode: 'pessimistic_write' } } =>
	supportsRowLocks(manager) ? { lock: { mode: 'pessimistic_write' } } : {};

/**
 * Reads `columns` of the row `id` within the caller's transaction and, where the database supports
 * it, locks the row until that transaction ends.
 *
 * For a subscriber's `beforeUpdate`: TypeORM loads `databaseEntity` before it opens the save's
 * transaction, so two concurrent saves can both see the same old values. Read under the lock, the
 * second save waits for the first one to commit and then sees its values.
 */
export async function lockedRow<Entity extends ObjectLiteral, Column extends keyof Entity & string>(
	manager: EntityManager,
	target: EntityTarget<Entity>,
	id: string,
	columns: ReadonlyArray<Column>
): Promise<Pick<Entity, Column> | undefined> {
	const query = manager
		.createQueryBuilder(target, 'locked')
		.select(['locked.id', ...columns.map((column) => `locked.${column}`)])
		.where('locked.id = :id', { id });
	if (supportsRowLocks(manager)) {
		query.setLock('pessimistic_write');
	}
	return (await query.getOne()) ?? undefined;
}
