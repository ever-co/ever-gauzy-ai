import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Entities } from '@packages/config/database';
import { Migrations } from '@packages/config/migrations';

/**
 * TypeORM CLI data source (PostgreSQL only). Used by:
 *   yarn migration:generate <Name>            — apply pending migrations, then diff the entities
 *                                               against DB_* into packages/config/src/migrations/<ts>-<Name>.ts
 *   yarn migration:run / migration:revert / migration:show
 *   yarn migration:generate:ephemeral <Name>  — same, against a disposable embedded PostgreSQL
 *
 * The application registers the same `Migrations` list and runs them at startup
 * (`DB_MIGRATIONS_RUN`, default true), see `packages/config/src/database.ts`; the TLS settings
 * (`DB_SSL_MODE`, `DB_CA_CERT`) are the same as there.
 */
const ssl =
	process.env.DB_SSL_MODE === 'true'
		? {
				rejectUnauthorized: true,
				ca: process.env.DB_CA_CERT ? Buffer.from(process.env.DB_CA_CERT, 'base64').toString('ascii') : undefined,
			}
		: undefined;

export default new DataSource({
	type: 'postgres',
	host: process.env.DB_HOST || 'localhost',
	port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
	username: process.env.DB_USER || 'postgres',
	password: process.env.DB_PASS || 'root',
	database: process.env.DB_NAME || 'gauzy_ai',
	ssl,
	entities: Entities,
	migrations: Migrations,
	synchronize: false,
	logging: false,
	uuidExtension: 'pgcrypto',
});
