import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `job_post.ingestedBy`: the `providerCode` of the job provider that stored the post (the channel it
 * came through), which picks its liveness verifier. `providerCode` alone cannot tell: Ever Jobs stores
 * each post under its site code (`linkedin`, `indeed`, … and `upwork` too), while the Upwork provider
 * (official API) stores `upwork`.
 *
 * Backfill of the existing rows, only where the provider is recognizable from what it has always
 * written:
 *   - `upwork` with a `providerJobId` that is not `upwork-…` → `upwork` (the official API stores
 *     Upwork's posting id);
 *   - a `providerJobId` that starts with `<providerCode>-` (or `unknown-` under `ever-jobs`, a result
 *     without a site) → `ever-jobs`: the Ever Jobs mapper's `<site>-<id>` / `<site>-<hash>`;
 *   - anything else (a post created through the API, `source-db`) stays null: unknown channel, no
 *     verifier is guessed for it.
 * Idempotent: `ADD COLUMN IF NOT EXISTS`, and only rows without a value are backfilled.
 */
export class AddJobPostIngestedBy1793562302557 implements MigrationInterface {
	name = 'AddJobPostIngestedBy1793562302557';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "job_post" ADD COLUMN IF NOT EXISTS "ingestedBy" character varying`,
		);
		const upwork = await queryRunner.query(
			`UPDATE "job_post" SET "ingestedBy" = 'upwork'
			 WHERE "ingestedBy" IS NULL AND "providerCode" = 'upwork'
			   AND "providerJobId" IS NOT NULL AND "providerJobId" NOT LIKE 'upwork-%'`,
		);
		const everJobs = await queryRunner.query(
			`UPDATE "job_post" SET "ingestedBy" = 'ever-jobs'
			 WHERE "ingestedBy" IS NULL AND "providerCode" <> 'source-db'
			   AND (left("providerJobId", length("providerCode") + 1) = "providerCode" || '-'
			     OR ("providerCode" = 'ever-jobs' AND left("providerJobId", 8) = 'unknown-'))`,
		);
		const count = (result: any) => result?.[1] ?? result?.affected ?? '?';
		console.log(
			`[migrations] job_post: ingestedBy backfilled (upwork: ${count(upwork)} rows, ever-jobs: ${count(everJobs)} rows)`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "job_post" DROP COLUMN IF EXISTS "ingestedBy"`,
		);
	}
}
