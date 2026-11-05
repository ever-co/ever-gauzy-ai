#!/usr/bin/env node
/**
 * Generates a migration from the difference between the entities and the database given by DB_*:
 *
 *   node scripts/generate-migration.mjs <Name>
 *
 * Applies the existing migrations first, so the new file only contains the increment. Run it
 * inside the disposable PostgreSQL for a clean diff:
 *
 *   yarn migration:generate:ephemeral <Name>
 *
 * The file is written to packages/config/src/migrations/<timestamp>-<Name>.ts; add it to the
 * `Migrations` list in packages/config/src/migrations/index.ts.
 */
import { spawnSync } from 'node:child_process';

const name = process.argv[2];
if (!name || !/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
	console.error('usage: node scripts/generate-migration.mjs <MigrationName>   (letters and digits, e.g. AddJobPostTags)');
	process.exit(2);
}

const typeorm = (...args) => {
	const result = spawnSync(
		process.execPath,
		['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', './node_modules/typeorm/cli.js', '-d', 'typeorm.config.ts', ...args],
		{ stdio: 'inherit', env: { ...process.env, TS_NODE_PROJECT: 'tsconfig.typeorm.json' } }
	);
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
};

typeorm('migration:run');
typeorm('migration:generate', `packages/config/src/migrations/${name}`, '--pretty');
