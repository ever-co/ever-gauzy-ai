import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every tenant-scoped row must carry `tenantId`: since 2026-10-31 all lookups are scoped by it.
 * Rows written by the older REST paths (`/api/employee/job/application/process`,
 * `/pre-process`) and source configs created with only `externalTenantId` have none, so they
 * would become invisible to their own tenant. Backfills, idempotently:
 *   - employee_job_post / employee_job_application / job_search_criterion / automation_task from
 *     their employee;
 *   - source_config from the tenant whose `externalTenantId` matches.
 */
export class BackfillTenantOwnership1793466042894 implements MigrationInterface {
	name = 'BackfillTenantOwnership1793466042894';

	public async up(queryRunner: QueryRunner): Promise<void> {
		for (const table of ['employee_job_post', 'employee_job_application', 'job_search_criterion', 'automation_task']) {
			if (!(await queryRunner.hasTable(table)) || !(await queryRunner.hasColumn(table, 'employeeId'))) continue;
			const result = await queryRunner.query(
				`UPDATE "${table}" t SET "tenantId" = e."tenantId"
				 FROM "employee" e
				 WHERE t."employeeId" = e."id" AND t."tenantId" IS NULL AND e."tenantId" IS NOT NULL`
			);
			console.log(`[migrations] ${table}: tenantId backfilled from employee (${result?.[1] ?? result?.affected ?? '?'} rows)`);
		}
		if ((await queryRunner.hasTable('source_config')) && (await queryRunner.hasTable('tenant'))) {
			// `tenant.externalTenantId` is not unique: a source config (which carries credentials) must
			// never be handed to an arbitrary one of several matching tenants.
			const ambiguous: Array<{ externalTenantId: string; tenants: string }> = await queryRunner.query(
				`SELECT t."externalTenantId", count(*)::text AS tenants
				 FROM "tenant" t
				 WHERE t."externalTenantId" IN (
				   SELECT s."externalTenantId" FROM "source_config" s WHERE s."tenantId" IS NULL AND s."externalTenantId" IS NOT NULL
				 )
				 GROUP BY t."externalTenantId" HAVING count(*) > 1`
			);
			if (ambiguous.length > 0) {
				throw new Error(
					`BackfillTenantOwnership: source_config rows cannot be assigned, several tenants share externalTenantId ` +
						ambiguous.map((a) => `${a.externalTenantId} (${a.tenants} tenants)`).join(', ') +
						`. Set source_config.tenantId for these rows by hand, then re-run the migrations.`
				);
			}
			// scalar subquery: PostgreSQL rejects more than one row, so a race with a new duplicate fails instead of guessing
			const result = await queryRunner.query(
				`UPDATE "source_config" s SET "tenantId" = (SELECT t."id" FROM "tenant" t WHERE t."externalTenantId" = s."externalTenantId")
				 WHERE s."tenantId" IS NULL AND s."externalTenantId" IS NOT NULL
				   AND EXISTS (SELECT 1 FROM "tenant" t WHERE t."externalTenantId" = s."externalTenantId")`
			);
			console.log(`[migrations] source_config: tenantId backfilled from tenant.externalTenantId (${result?.[1] ?? result?.affected ?? '?'} rows)`);
		}
	}

	public async down(): Promise<void> {
		// Data backfill; nothing to revert.
	}
}
