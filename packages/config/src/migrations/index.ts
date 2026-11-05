import { MigrationInterface } from 'typeorm';
import { InitialSchema1793466042892 } from './1793466042892-InitialSchema';
import { RenameLegacySearchCriteria1793466042893 } from './1793466042893-RenameLegacySearchCriteria';
import { BackfillTenantOwnership1793466042894 } from './1793466042894-BackfillTenantOwnership';
import { AddMatchScoringAttempts1793477758501 } from './1793477758501-AddMatchScoringAttempts';
import { AddUserEmailLowerIndex1793480000000 } from './1793480000000-AddUserEmailLowerIndex';
import { AddJobPostIngestedBy1793562302557 } from './1793562302557-AddJobPostIngestedBy';
import { AddEmployeeJobPostPairUnique1793579883247 } from './1793579883247-AddEmployeeJobPostPairUnique';

/**
 * Ordered list of PostgreSQL migrations. Registered on the application DataSource
 * (`migrationsRun`, see database.ts) and on the CLI data source (typeorm.config.ts).
 *
 * The bundle (rspack) cannot glob for migration files, so every migration is imported here.
 * Generate a new one with `yarn migration:generate:ephemeral <Name>` (disposable embedded PostgreSQL)
 * or `yarn migration:generate <Name>` (your DB_*), then add it to this list.
 *
 * Databases that predate migrations (schema created by `synchronize`) are baselined by
 * InitialSchema (it only records itself when the tables already exist). Such a schema may already
 * contain what later migrations add, so every migration after the baseline must be idempotent
 * (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, guarded renames); the migration e2e
 * suite upgrades a baselined database and fails on a migration that is not.
 */
export const Migrations: Array<new () => MigrationInterface> = [
	InitialSchema1793466042892,
	RenameLegacySearchCriteria1793466042893,
	BackfillTenantOwnership1793466042894,
	AddMatchScoringAttempts1793477758501,
	AddUserEmailLowerIndex1793480000000,
	AddJobPostIngestedBy1793562302557,
	AddEmployeeJobPostPairUnique1793579883247,
];
