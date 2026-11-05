import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEX = 'UQ_employee_job_post_employee_job_post';
const DUPLICATES = 'employee_job_post_duplicate';

/**
 * One match per employee ↔ job post: a unique index on ("employeeId", "jobPostId"), declared on the
 * entity. The older UNIQUE ("tenantId", "orgId", "employeeId", "jobPostId") does not hold for rows
 * whose orgId is NULL (NULLs are distinct), and matching now re-evaluates stored posts, so it inserts
 * with ON CONFLICT DO NOTHING against this index.
 *
 * Rows that already duplicate a pair are merged first, or the index could not be created: per pair
 * the applied match is kept, else a scored one, else the oldest; applications of the other rows are
 * moved to the kept one, then the other rows are deleted (they cannot be restored by `down`).
 * Idempotent: a second run finds no duplicates and the index exists.
 */
export class AddEmployeeJobPostPairUnique1793579883247 implements MigrationInterface {
	name = 'AddEmployeeJobPostPairUnique1793579883247';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "${DUPLICATES}"`);
		await queryRunner.query(`
			CREATE TEMPORARY TABLE "${DUPLICATES}" AS
			SELECT "id", "keepId" FROM (
				SELECT "id",
					first_value("id") OVER pair AS "keepId",
					row_number() OVER pair AS "rank"
				FROM "employee_job_post"
				WHERE "jobPostId" IS NOT NULL
				WINDOW pair AS (
					PARTITION BY "employeeId", "jobPostId"
					ORDER BY ("isApplied" IS TRUE) DESC, ("matchScore" IS NOT NULL) DESC, "createdAt" ASC, "id" ASC
				)
			) ranked
			WHERE "rank" > 1
		`);
		const [{ count }] = await queryRunner.query(`SELECT count(*)::int AS "count" FROM "${DUPLICATES}"`);
		if (count > 0) {
			await queryRunner.query(`
				UPDATE "employee_job_application" a SET "employeeJobPostId" = d."keepId"
				FROM "${DUPLICATES}" d
				WHERE a."employeeJobPostId" = d."id"
			`);
			await queryRunner.query(`DELETE FROM "employee_job_post" p USING "${DUPLICATES}" d WHERE p."id" = d."id"`);
			console.log(`[migrations] employee_job_post: ${count} duplicate match row(s) merged into the kept match of their pair`);
		}
		await queryRunner.query(`DROP TABLE "${DUPLICATES}"`);

		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX}" ON "employee_job_post" ("employeeId", "jobPostId")`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "${INDEX}"`);
	}
}
