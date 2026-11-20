import * as path from 'path';
import { TlsOptions } from 'tls';
import { Injectable, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import {
	AutomationTask,
	Employee,
	EmployeeJobApplication,
	EmployeeJobPost,
	JobPost,
	Organization,
	Tenant,
	TenantApiKey,
	User,
	SourceConfig,
	JobSearchCriterion
} from '@packages/entities';
import { EntitySubscriberInterface } from 'typeorm';
import { EmployeeSubscriber } from '@packages/employee/employee.subscriber';
import { UserSubscriber } from '@packages/user/user.subscriber';
import { Migrations } from './migrations';
import { dbLoggingOptions } from './db-logging';

/**
 * All entities used in the application.
 * When adding new provider libraries, include their entities here.
 */
export const Entities = [
	// Core entities
	Tenant,
	TenantApiKey,
	Organization,
	User,
	Employee,
	EmployeeJobPost,
	EmployeeJobApplication,
	AutomationTask,
	JobPost,
	// Source configuration & search criteria
	SourceConfig,
	JobSearchCriterion
];

/**
 * A map of the core TypeORM Subscribers.
 */
export const coreSubscribers = [
	EmployeeSubscriber,
	UserSubscriber
];

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
	constructor(private readonly configService: ConfigService) { }

	async createTypeOrmOptions(): Promise<TypeOrmModuleOptions> {
		let options: any;
		const dbType = this.configService.get<string>('config.dbType');
		console.log('DB Type configured: ' + dbType);
		{
			if (dbType == 'sqljs') {
				options = {
					type: dbType,
					autoSave: true,
					location: 'gauzy-ai.db',
					// DB_LOGGING / DB_LOGGER, default errors and warnings to stdout (see ./db-logging.ts).
					...dbLoggingOptions(),
					entities: Entities,
					subscribers: coreSubscribers as Array<Type<EntitySubscriberInterface>>,
					// TypeORM 1.x throws on `undefined` in a where clause; keep the 0.3 behavior (ignore the property).
					invalidWhereValuesBehavior: { undefined: 'ignore' },
					synchronize:
						process.env.DB_SYNCHRONIZE === 'true' ? true : false, // We are using migrations, synchronize should be set to false.
				};
			} else if (dbType == 'sqlite') {
				const dbPath =
					process.env.DB_PATH ||
					path.join(process.cwd(), 'gauzy.sqlite3');

				console.log('Sqlite DB Path: ' + dbPath);

				options = {
					type: dbType,
					database: dbPath,
					// DB_LOGGING / DB_LOGGER, default errors and warnings to stdout (see ./db-logging.ts).
					...dbLoggingOptions(),
					entities: Entities,
					subscribers: coreSubscribers as Array<Type<EntitySubscriberInterface>>,
					// TypeORM 1.x throws on `undefined` in a where clause; keep the 0.3 behavior (ignore the property).
					invalidWhereValuesBehavior: { undefined: 'ignore' },
					synchronize:
						process.env.DB_SYNCHRONIZE === 'true' ? true : false, // We are using migrations, synchronize should be set to false.
				};
			} else if (dbType == 'postgres') {
				const ssl =
					process.env.DB_SSL_MODE === 'true' ? true : undefined;

				let sslParams: TlsOptions;

				if (ssl) {
					const base64data = process.env.DB_CA_CERT;
					const buff = Buffer.from(base64data, 'base64');
					const sslCert = buff.toString('ascii');

					sslParams = {
						rejectUnauthorized: true,
						ca: sslCert,
					};
				}

				options = {
					type: dbType,
					host: process.env.DB_HOST || 'localhost',
					username: process.env.DB_USER || 'postgres',
					password: process.env.DB_PASS || 'root',
					ssl: ssl ? sslParams : undefined,
					database: process.env.DB_NAME || 'gauzy_ai',
					port: process.env.DB_PORT
						? parseInt(process.env.DB_PORT, 10)
						: 5432,
					entities: Entities,
					subscribers: coreSubscribers as Array<Type<EntitySubscriberInterface>>,
					// TypeORM 1.x throws on `undefined` in a where clause; keep the 0.3 behavior (ignore the property).
					invalidWhereValuesBehavior: { undefined: 'ignore' },
					// autoLoadEntities: true, // Note: possible to use instead: entities: Entities,
					// DB_LOGGING / DB_LOGGER, default errors and warnings to stdout (see ./db-logging.ts).
					...dbLoggingOptions(),
					// The schema is owned by the migrations in ./migrations and applied at startup. `synchronize` stays
					// available for local experiments only (DB_SYNCHRONIZE=true).
					synchronize: process.env.DB_SYNCHRONIZE === 'true',
					migrations: Migrations,
					migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
					migrationsTransactionMode: 'each',
					uuidExtension: 'pgcrypto',
				} as TypeOrmModuleOptions;
			} else {
				throw new Error(
					`Critical: DB of type ${dbType} not supported yet`
				);
			}
		}
		return options;
	}
}
