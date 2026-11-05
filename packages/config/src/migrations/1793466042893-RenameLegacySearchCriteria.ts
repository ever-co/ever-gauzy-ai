import { DefaultNamingStrategy, MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'job_search_criterion';
const LEGACY_TABLE = 'employee_upwork_jobs_search_criterion';
/** Columns the entity gained after the rename (a fresh schema has them from InitialSchema). */
const ADDED_COLUMNS: Array<[string, string]> = [
	['location', 'character varying'],
	['country', 'character varying'],
	['isRemote', 'boolean'],
	['hoursOld', 'integer'],
];
/** Single-column indexes the entity declares, as InitialSchema creates them. */
const INDEXED_COLUMNS = [
	'tenantId',
	'orgId',
	'category',
	'categoryId',
	'occupation',
	'occupationId',
	'jobType',
	'keyword',
	'location',
	'country',
	'employeeId',
];
const naming = new DefaultNamingStrategy();

/**
 * The 2026 refactor renamed the per-employee search criteria table
 * `employee_upwork_jobs_search_criterion` → `job_search_criterion` (and the entity
 * UpworkJobsSearchCriterion → JobSearchCriterion) without a migration: a database created before
 * the rename kept the old table and the application created/expected the new one.
 *
 * Idempotent: renames the legacy table when it exists and the new one does not, then — whenever the
 * canonical table exists, renamed now or by an earlier release — adds the columns the entity gained
 * later (location, country, isRemote, hoursOld) and makes the table identical to a fresh one:
 * generated primary-key / foreign-key / index names that still encoded the legacy table name and
 * missing indexes would trip later migrations (generated against a fresh schema), and missing
 * columns would break criterion queries now that `synchronize` is off.
 * When both tables exist, an empty legacy table is dropped and a non-empty one stops the migration
 * so that an operator reconciles the rows explicitly (nothing is merged by guesswork).
 */
export class RenameLegacySearchCriteria1793466042893 implements MigrationInterface {
	name = 'RenameLegacySearchCriteria1793466042893';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const hasLegacy = await queryRunner.hasTable(LEGACY_TABLE);
		const hasNew = await queryRunner.hasTable(TABLE);
		if (hasLegacy && hasNew) {
			// A release booted with `synchronize` after the rename created the new table next to the
			// legacy one. An empty legacy table is just dropped; one with rows needs an operator.
			// The lock (held until the migration's transaction ends) makes count-then-drop atomic: a row
			// inserted by a still-running old release between the two cannot be lost.
			await queryRunner.query(`LOCK TABLE "${LEGACY_TABLE}" IN ACCESS EXCLUSIVE MODE`);
			const [{ count }] = await queryRunner.query(`SELECT count(*)::text AS count FROM "${LEGACY_TABLE}"`);
			if (count !== '0') {
				throw new Error(
					`RenameLegacySearchCriteria: both ${LEGACY_TABLE} (${count} rows) and ${TABLE} exist. ` +
						`Move the legacy rows into ${TABLE} (same columns) or drop the legacy table, then re-run the migrations.`
				);
			}
			await queryRunner.query(`DROP TABLE "${LEGACY_TABLE}"`);
			console.log(`[migrations] dropped the empty legacy ${LEGACY_TABLE} table`);
		} else if (hasLegacy) {
			await queryRunner.query(`ALTER TABLE "${LEGACY_TABLE}" RENAME TO "${TABLE}"`);
			console.log(`[migrations] renamed ${LEGACY_TABLE} -> ${TABLE}`);
		} else if (!hasNew) {
			return; // nothing to upgrade (InitialSchema creates the table on a fresh database)
		}
		// Whatever the history of the table (just renamed, renamed by an earlier release, or created by
		// synchronize before the entity gained columns), bring it to the shape InitialSchema creates:
		// the columns the entity gained later and TypeORM's generated constraint / index names.
		for (const [column, type] of ADDED_COLUMNS) {
			await queryRunner.query(`ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
		}
		await this.normaliseNames(queryRunner);
		console.log(`[migrations] ${TABLE}: columns, constraints and indexes aligned with the entity`);
	}

	/**
	 * Renames constraints and indexes to the names TypeORM generates for `job_search_criterion`
	 * (what InitialSchema creates on a fresh database) and adds the entity's indexes the legacy
	 * schema lacked, so that `synchronize`-style schema diffs come out empty after the upgrade.
	 */
	private async normaliseNames(queryRunner: QueryRunner): Promise<void> {
		const constraints: Array<{ conname: string; contype: string; columns: string[] }> = await queryRunner.query(
			`SELECT c.conname, c.contype, array_agg(a.attname::text ORDER BY k.ordinality) AS columns
			 FROM pg_constraint c
			 JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
			 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
			 WHERE c.conrelid = '"${TABLE}"'::regclass AND c.contype IN ('p', 'f', 'u')
			 GROUP BY c.conname, c.contype`
		);
		for (const constraint of constraints) {
			const canonical =
				constraint.contype === 'p'
					? naming.primaryKeyName(TABLE, constraint.columns)
					: constraint.contype === 'f'
						? naming.foreignKeyName(TABLE, constraint.columns)
						: naming.uniqueConstraintName(TABLE, constraint.columns);
			if (constraint.conname !== canonical) {
				await queryRunner.query(`ALTER TABLE "${TABLE}" RENAME CONSTRAINT "${constraint.conname}" TO "${canonical}"`);
			}
		}

		const indexes: Array<{ indexname: string; columns: string[] }> = await queryRunner.query(
			`SELECT i.relname AS indexname, array_agg(a.attname::text ORDER BY k.ordinality) AS columns
			 FROM pg_index x
			 JOIN pg_class i ON i.oid = x.indexrelid
			 JOIN unnest(x.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
			 JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
			 WHERE x.indrelid = '"${TABLE}"'::regclass AND NOT x.indisprimary AND NOT x.indisunique
			 GROUP BY i.relname`
		);
		const present = new Set<string>();
		for (const index of indexes) {
			const canonical = naming.indexName(TABLE, index.columns);
			if (index.indexname !== canonical) {
				await queryRunner.query(`ALTER INDEX "${index.indexname}" RENAME TO "${canonical}"`);
			}
			present.add(canonical);
		}
		for (const column of INDEXED_COLUMNS) {
			const canonical = naming.indexName(TABLE, [column]);
			if (!present.has(canonical)) {
				await queryRunner.query(`CREATE INDEX "${canonical}" ON "${TABLE}" ("${column}")`);
			}
		}
	}

	public async down(): Promise<void> {
		// The rename is not reverted: the old name is unknown to every current version of the code.
	}
}
