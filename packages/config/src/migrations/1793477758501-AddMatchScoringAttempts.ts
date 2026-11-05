import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bookkeeping for pending-match scoring (claims, attempts, last error), see OpsService.
 * Idempotent (IF NOT EXISTS): a database created by `synchronize` and baselined by InitialSchema
 * may already have these columns.
 */
export class AddMatchScoringAttempts1793477758501 implements MigrationInterface {
    name = 'AddMatchScoringAttempts1793477758501';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "employee_job_post"
            ADD COLUMN IF NOT EXISTS "scoringAttempts" integer NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "employee_job_post"
            ADD COLUMN IF NOT EXISTS "scoringStartedAt" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "employee_job_post"
            ADD COLUMN IF NOT EXISTS "scoringError" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "employee_job_post" DROP COLUMN IF EXISTS "scoringError"
        `);
        await queryRunner.query(`
            ALTER TABLE "employee_job_post" DROP COLUMN IF EXISTS "scoringStartedAt"
        `);
        await queryRunner.query(`
            ALTER TABLE "employee_job_post" DROP COLUMN IF EXISTS "scoringAttempts"
        `);
    }

}
