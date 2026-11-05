import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ever ID sign-in looks users up by e-mail case-insensitively (`LOWER(email) = :email`), which the
 * plain `email` index cannot serve. Expression index, declared on the entity with
 * `synchronize: false` (TypeORM neither creates nor drops it). Idempotent.
 */
export class AddUserEmailLowerIndex1793480000000 implements MigrationInterface {
	name = 'AddUserEmailLowerIndex1793480000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_email_lower" ON "user" (LOWER("email"))`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_email_lower"`);
	}
}
