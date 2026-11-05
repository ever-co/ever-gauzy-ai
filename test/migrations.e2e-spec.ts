/**
 * Runs the real migrations against the PostgreSQL given by DB_*, which must be disposable
 * (`DB_DISPOSABLE=true`; `yarn test:e2e:ephemeral` starts an embedded one). Skipped otherwise.
 */
import { DataSource, DefaultNamingStrategy } from 'typeorm';
import { Entities } from '@packages/config/database';
import { Migrations } from '@packages/config/migrations';
import { EmployeeJobPost } from '@packages/entities';
import { EmployeeJobPostCreateCommandHandler } from '@packages/employeeJobPost/handlers/employeeJobPostCreate.handler';
import { EmployeeJobPostCreateCommand } from '@packages/employeeJobPost/commands/employeeJobPostCreate.command';

// Destructive (drops the public schema): runs only against a database declared disposable,
// i.e. under scripts/with-postgres.mjs (DB_DISPOSABLE=true) — never against a developer's DB_*.
const disposablePostgres = process.env.DB_TYPE === 'postgres' && process.env.DB_DISPOSABLE === 'true';
if (process.env.DB_TYPE === 'postgres' && !disposablePostgres) {
	console.warn('[migrations.e2e] skipped: set DB_DISPOSABLE=true (or use `yarn test:e2e:ephemeral`) to run against a database that may be wiped');
}
const describeIfPg = disposablePostgres ? describe : describe.skip;

const TABLE = 'job_search_criterion';
const LEGACY_TABLE = 'employee_upwork_jobs_search_criterion';
const naming = new DefaultNamingStrategy();

describeIfPg('database migrations (PostgreSQL)', () => {
	let ds: DataSource;

	const dataSource = () =>
		new DataSource({
			type: 'postgres',
			host: process.env.DB_HOST,
			port: parseInt(process.env.DB_PORT || '5432', 10),
			username: process.env.DB_USER,
			password: process.env.DB_PASS,
			database: process.env.DB_NAME,
			// same TLS settings as the application and the CLI data source
			ssl:
				process.env.DB_SSL_MODE === 'true'
					? {
							rejectUnauthorized: true,
							ca: process.env.DB_CA_CERT ? Buffer.from(process.env.DB_CA_CERT, 'base64').toString('ascii') : undefined,
						}
					: undefined,
			entities: Entities,
			migrations: Migrations,
			synchronize: false,
			logging: false,
			uuidExtension: 'pgcrypto',
		});

	const migrationNames = () => Migrations.map((m) => new m().name);
	const migrationNamed = (prefix: string) => Migrations.find((m) => new m().name.startsWith(prefix))!;
	const resetSchema = async () => ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
	/** What `synchronize` would still do; empty means the entities and the database agree. */
	const pendingSchemaChanges = async () => (await ds.driver.createSchemaBuilder().log()).upQueries.map((q) => q.query);

	/**
	 * Turns a fresh schema into what `synchronize` produced before the 2026 rename: the legacy
	 * table name, constraint and index names derived from it, and without the columns the entity
	 * gained later. The migrations table is emptied: such a database predates migrations.
	 */
	const degradeToLegacySchema = async () => {
		await ds.query(`ALTER TABLE "${TABLE}" RENAME TO "${LEGACY_TABLE}"`);
		for (const column of ['location', 'country']) {
			await ds.query(`DROP INDEX "${naming.indexName(TABLE, [column])}"`);
		}
		await ds.query(`ALTER TABLE "${LEGACY_TABLE}" DROP COLUMN "location", DROP COLUMN "country", DROP COLUMN "isRemote", DROP COLUMN "hoursOld"`);
		await ds.query(
			`ALTER TABLE "${LEGACY_TABLE}" RENAME CONSTRAINT "${naming.primaryKeyName(TABLE, ['id'])}" TO "${naming.primaryKeyName(LEGACY_TABLE, ['id'])}"`
		);
		for (const column of ['tenantId', 'orgId', 'employeeId']) {
			await ds.query(
				`ALTER TABLE "${LEGACY_TABLE}" RENAME CONSTRAINT "${naming.foreignKeyName(TABLE, [column])}" TO "${naming.foreignKeyName(LEGACY_TABLE, [column])}"`
			);
		}
		for (const column of ['tenantId', 'orgId', 'category', 'categoryId', 'occupation', 'occupationId', 'jobType', 'keyword', 'employeeId']) {
			await ds.query(`ALTER INDEX "${naming.indexName(TABLE, [column])}" RENAME TO "${naming.indexName(LEGACY_TABLE, [column])}"`);
		}
		await ds.query('DELETE FROM "migrations"');
	};

	beforeAll(async () => {
		ds = await dataSource().initialize();
		await resetSchema();
	});
	afterAll(async () => {
		await ds?.destroy();
	});

	it('creates the whole schema on an empty database and is idempotent', async () => {
		const applied = await ds.runMigrations();
		expect(applied.map((m) => m.name)).toEqual(migrationNames());
		const qr = ds.createQueryRunner();
		for (const table of ['tenant', 'tenant_api_key', 'user', 'employee', 'job_post', 'employee_job_post', 'employee_job_application', TABLE, 'source_config', 'automation_task']) {
			expect(await qr.hasTable(table)).toBe(true);
		}
		await qr.release();
		expect(await ds.runMigrations()).toHaveLength(0);
	});

	it('the entities match the migrated schema (no pending schema changes)', async () => {
		await ds.runMigrations(); // no-op after the previous test; makes this test self-contained
		expect(await pendingSchemaChanges()).toEqual([]);
	});

	it('upgrades a legacy database through the runner: baseline, rename, tenant backfill, and no schema drift afterwards', async () => {
		await resetSchema();
		await ds.runMigrations();
		await degradeToLegacySchema();
		// data written before tenant scoping
		const [tenant] = await ds.query(`INSERT INTO "tenant" ("name", "externalTenantId", "isActive", "isArchived") VALUES ('T1', 'ext-1', true, false) RETURNING "id"`);
		const [employee] = await ds.query(`INSERT INTO "employee" ("tenantId", "isActive", "isArchived") VALUES ($1, true, false) RETURNING "id"`, [tenant.id]);
		await ds.query(`INSERT INTO "${LEGACY_TABLE}" ("keyword", "employeeId") VALUES ('react', $1)`, [employee.id]);
		await ds.query(`INSERT INTO "source_config" ("sourceCode", "externalTenantId", "isActive", "isArchived") VALUES ('upwork', 'ext-1', true, false)`);

		// the production upgrade path: InitialSchema baselines the existing schema, the others do the work
		const applied = await ds.runMigrations();
		expect(applied.map((m) => m.name)).toEqual(migrationNames());

		const qr = ds.createQueryRunner();
		expect(await qr.hasTable(LEGACY_TABLE)).toBe(false);
		expect(await qr.hasTable(TABLE)).toBe(true);
		expect(await qr.hasColumn(TABLE, 'hoursOld')).toBe(true);
		await qr.release();

		const [criterion] = await ds.query(`SELECT "tenantId" FROM "${TABLE}" WHERE "keyword" = 'react'`);
		expect(criterion.tenantId).toBe(tenant.id);
		const [config] = await ds.query(`SELECT "tenantId" FROM "source_config" WHERE "sourceCode" = 'upwork'`);
		expect(config.tenantId).toBe(tenant.id);

		// the upgraded schema equals a fresh one: constraint and index names, indexes, columns
		expect(await pendingSchemaChanges()).toEqual([]);
		expect(await ds.runMigrations()).toHaveLength(0);
	});

	it('an already-renamed table that predates the newer columns receives them (and the indexes) on upgrade', async () => {
		await resetSchema();
		await ds.runMigrations();
		// a database renamed by an earlier release, created before location/country/isRemote/hoursOld existed
		for (const column of ['location', 'country']) {
			await ds.query(`DROP INDEX "${naming.indexName(TABLE, [column])}"`);
		}
		await ds.query(`ALTER TABLE "${TABLE}" DROP COLUMN "location", DROP COLUMN "country", DROP COLUMN "isRemote", DROP COLUMN "hoursOld"`);
		await ds.query('DELETE FROM "migrations"');

		const applied = await ds.runMigrations();
		expect(applied.map((m) => m.name)).toEqual(migrationNames());
		const qr = ds.createQueryRunner();
		for (const column of ['location', 'country', 'isRemote', 'hoursOld']) {
			expect(await qr.hasColumn(TABLE, column)).toBe(true);
		}
		await qr.release();
		expect(await pendingSchemaChanges()).toEqual([]);
	});

	it('refuses to hand a source config to one of several tenants sharing an externalTenantId', async () => {
		await resetSchema();
		await ds.runMigrations();
		await ds.query(`INSERT INTO "tenant" ("name", "externalTenantId", "isActive", "isArchived") VALUES ('A', 'shared', true, false), ('B', 'shared', true, false)`);
		await ds.query(`INSERT INTO "source_config" ("sourceCode", "externalTenantId", "isActive", "isArchived") VALUES ('upwork', 'shared', true, false)`);
		const backfill = migrationNamed('BackfillTenantOwnership');
		const qr = ds.createQueryRunner();
		await expect(new backfill().up(qr)).rejects.toThrow(/several tenants share externalTenantId shared/);
		await qr.release();
		const [config] = await ds.query(`SELECT "tenantId" FROM "source_config" WHERE "sourceCode" = 'upwork'`);
		expect(config.tenantId).toBeNull();
	});

	it('with both criteria tables present: drops an empty legacy table, refuses a non-empty one', async () => {
		await resetSchema();
		await ds.runMigrations();
		const rename = migrationNamed('RenameLegacySearchCriteria');
		// like the runner does (migrationsTransactionMode 'each'): the migration runs inside a transaction
		await ds.query(`CREATE TABLE "${LEGACY_TABLE}" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "keyword" varchar, "employeeId" uuid, "tenantId" uuid)`);
		let qr = ds.createQueryRunner();
		await qr.startTransaction();
		await new rename().up(qr);
		await qr.commitTransaction();
		expect(await qr.hasTable(LEGACY_TABLE)).toBe(false);
		expect(await qr.hasTable(TABLE)).toBe(true);
		await qr.release();

		await ds.query(`CREATE TABLE "${LEGACY_TABLE}" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "keyword" varchar, "employeeId" uuid, "tenantId" uuid)`);
		await ds.query(`INSERT INTO "${LEGACY_TABLE}" ("keyword") VALUES ('react')`);
		qr = ds.createQueryRunner();
		await qr.startTransaction();
		await expect(new rename().up(qr)).rejects.toThrow(/both employee_upwork_jobs_search_criterion \(1 rows\) and job_search_criterion exist/);
		await qr.rollbackTransaction();
		expect(await qr.hasTable(LEGACY_TABLE)).toBe(true);
		await qr.release();
		expect(await pendingSchemaChanges()).toEqual([]); // the canonical table was left untouched
	});

	it('backfills job_post.ingestedBy from what each provider wrote (idempotent) on a database that predates the column', async () => {
		await resetSchema();
		await ds.runMigrations();
		// a database from before the column: the posts each provider stored
		await ds.query(`ALTER TABLE "job_post" DROP COLUMN "ingestedBy"`);
		await ds.query(
			`INSERT INTO "job_post" ("providerCode", "providerJobId", "title", "isActive", "isArchived") VALUES
			 ('linkedin', 'linkedin-1', 'via Ever Jobs', true, false),
			 ('upwork', 'upwork-upwork-2056488576136638272', 'Upwork via Ever Jobs', true, false),
			 ('upwork', '2056488576136638272', 'Upwork official API', true, false),
			 ('ever-jobs', 'unknown-1x9zq', 'Ever Jobs without a site', true, false),
			 ('zip_recruiter', 'zip_recruiter-77', 'site code with an underscore', true, false),
			 ('acme-board', '123', 'created through the API', true, false),
			 ('linkedin', 'abc', 'created through the API under a site code', true, false),
			 ('upwork', NULL, 'Upwork without a posting id', true, false),
			 ('source-db', 'source-db-1', 'never stored by source-db', true, false)`
		);
		const migration = migrationNamed('AddJobPostIngestedBy');
		const qr = ds.createQueryRunner();
		await new migration().up(qr);
		await new migration().up(qr); // idempotent
		await qr.release();

		const rows: Array<{ title: string; ingestedBy: string | null }> = await ds.query(`SELECT "title", "ingestedBy" FROM "job_post" ORDER BY "title"`);
		expect(Object.fromEntries(rows.map((r) => [r.title, r.ingestedBy]))).toEqual({
			'via Ever Jobs': 'ever-jobs',
			'Upwork via Ever Jobs': 'ever-jobs',
			'Upwork official API': 'upwork',
			'Ever Jobs without a site': 'ever-jobs',
			'site code with an underscore': 'ever-jobs',
			// unknown provenance stays unknown: no verifier is guessed for it
			'created through the API': null,
			'created through the API under a site code': null,
			'Upwork without a posting id': null,
			'never stored by source-db': null,
		});
		expect(await pendingSchemaChanges()).toEqual([]);
	});

	it('merges duplicate matches into one per employee and job post, then enforces it', async () => {
		await resetSchema();
		await ds.runMigrations();
		// a database from before the pair index, holding duplicates the old (tenantId, orgId, ...) constraint let through (orgId NULL)
		const pairIndex = migrationNamed('AddEmployeeJobPostPairUnique');
		await ds.query(`DROP INDEX "UQ_employee_job_post_employee_job_post"`);
		await ds.query(`DELETE FROM "migrations" WHERE "name" = $1`, [new pairIndex().name]);
		const [tenant] = await ds.query(`INSERT INTO "tenant" ("name", "isActive", "isArchived") VALUES ('T1', true, false) RETURNING "id"`);
		const [employee] = await ds.query(`INSERT INTO "employee" ("tenantId", "isActive", "isArchived") VALUES ($1, true, false) RETURNING "id"`, [tenant.id]);
		const [job] = await ds.query(`INSERT INTO "job_post" ("providerCode", "title") VALUES ('linkedin', 'React') RETURNING "id"`);
		const insertMatch = async (createdAt: string, isApplied: boolean) =>
			(
				await ds.query(
					`INSERT INTO "employee_job_post" ("tenantId", "employeeId", "jobPostId", "providerCode", "isApplied", "createdAt") VALUES ($1, $2, $3, 'linkedin', $4, $5) RETURNING "id"`,
					[tenant.id, employee.id, job.id, isApplied, createdAt]
				)
			)[0].id as string;
		const oldest = await insertMatch('2026-10-01T00:00:00Z', false);
		const applied = await insertMatch('2026-10-02T00:00:00Z', true);
		await insertMatch('2026-10-03T00:00:00Z', false);
		const [application] = await ds.query(
			`INSERT INTO "employee_job_application" ("tenantId", "employeeId", "jobPostId", "employeeJobPostId", "providerCode") VALUES ($1, $2, $3, $4, 'linkedin') RETURNING "id"`,
			[tenant.id, employee.id, job.id, oldest]
		);

		const ran = await ds.runMigrations();
		expect(ran.map((m) => m.name)).toEqual([new pairIndex().name]);

		// the applied match is kept, the application of a merged row follows it
		const rows = await ds.query(`SELECT "id" FROM "employee_job_post" WHERE "employeeId" = $1`, [employee.id]);
		expect(rows).toEqual([{ id: applied }]);
		const [moved] = await ds.query(`SELECT "employeeJobPostId" FROM "employee_job_application" WHERE "id" = $1`, [application.id]);
		expect(moved.employeeJobPostId).toBe(applied);

		// a second match for the pair is refused, or skipped by the insert matching uses
		await expect(
			ds.query(`INSERT INTO "employee_job_post" ("employeeId", "jobPostId", "providerCode") VALUES ($1, $2, 'linkedin')`, [employee.id, job.id])
		).rejects.toThrow(/duplicate key/);
		await ds.query(`INSERT INTO "employee_job_post" ("employeeId", "jobPostId", "providerCode") VALUES ($1, $2, 'linkedin') ON CONFLICT DO NOTHING`, [employee.id, job.id]);
		expect(await ds.query(`SELECT "id" FROM "employee_job_post" WHERE "employeeId" = $1`, [employee.id])).toHaveLength(1);

		// idempotent, and the entities agree with the schema
		const qr = ds.createQueryRunner();
		await new pairIndex().up(qr);
		await qr.release();
		expect(await pendingSchemaChanges()).toEqual([]);
	});

	it('the matching insert stores one match per employee and job post, even with a NULL orgId', async () => {
		await resetSchema();
		await ds.runMigrations();
		const [tenant] = await ds.query(`INSERT INTO "tenant" ("name", "isActive", "isArchived") VALUES ('T1', true, false) RETURNING "id"`);
		const [employee] = await ds.query(`INSERT INTO "employee" ("tenantId", "isActive", "isArchived") VALUES ($1, true, false) RETURNING "id"`, [tenant.id]);
		const jobIds: string[] = [];
		for (const title of ['React', 'Vue', 'Svelte']) {
			const [job] = await ds.query(`INSERT INTO "job_post" ("providerCode", "title") VALUES ('linkedin', $1) RETURNING "id"`, [title]);
			jobIds.push(job.id);
		}
		const repo = ds.getRepository(EmployeeJobPost);
		const handler = new EmployeeJobPostCreateCommandHandler(repo, { publish: jest.fn() } as any);
		const match = (jobPostId: string, matchScore = 80) =>
			Object.assign(new EmployeeJobPost(), {
				tenantId: tenant.id,
				employeeId: employee.id,
				jobPostId,
				providerCode: 'linkedin',
				isActive: true,
				isArchived: false,
				isApplied: false,
				matchScore,
				skillsEvidence: [{ required: 'React', match: true }],
				scoredAt: new Date(),
			});

		const first = await handler.execute(new EmployeeJobPostCreateCommand([match(jobIds[1]), match(jobIds[1])]));
		expect(first).toHaveLength(1);
		expect(first[0].createdAt).toBeInstanceOf(Date);
		// a later pass (e.g. re-matching a source-db post) stores only the pairs that are new; the skipped
		// row in the middle of the batch does not shift the ids or values of the others
		const second = await handler.execute(new EmployeeJobPostCreateCommand([match(jobIds[0], 70), match(jobIds[1]), match(jobIds[2], 90)]));
		expect(second.map((m) => [m.jobPostId, m.matchScore])).toEqual([
			[jobIds[0], 70],
			[jobIds[2], 90],
		]);

		const rows = await repo.find({ where: { employeeId: employee.id } });
		expect(rows).toHaveLength(3);
		const byJob = new Map(rows.map((row) => [row.jobPostId, row]));
		expect(byJob.get(jobIds[1])!.id).toBe(first[0].id);
		expect(byJob.get(jobIds[0])!.id).toBe(second[0].id);
		expect(byJob.get(jobIds[2])!.id).toBe(second[1].id);
		expect(Number(byJob.get(jobIds[2])!.matchScore)).toBe(90);
		expect(byJob.get(jobIds[0])!.skillsEvidence).toEqual([{ required: 'React', match: true }]);
		expect(byJob.get(jobIds[0])!.scoringAttempts).toBe(0);
	});

	it('the baseline migration cannot be reverted', async () => {
		const initial = migrationNamed('InitialSchema');
		await expect(new initial().down(ds.createQueryRunner())).rejects.toThrow(/cannot be reverted/);
	});
});
