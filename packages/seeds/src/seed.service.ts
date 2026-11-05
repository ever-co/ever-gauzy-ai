import { DataSource, DataSourceOptions } from 'typeorm';
import { Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Entities, TypeOrmConfigService } from '@packages/config';
import { ConfigService } from '@nestjs/config';
import { createEmployees } from '@packages/employee/employee.seed';
import { createJobSearchCriteria } from './jobSearchCriteria.seed';
import { ConfigurationService } from '@packages/config';
import { EmployeeService } from '@packages/employee/employee.service';

@Injectable()
export class SeedDataService {
	connection: DataSource;
	log = console.log;

	constructor(
		// Nest's own DataSource (the app and the seed CLI both initialize it). Reused so that sqljs/sqlite seeding
		// writes into the database the application repositories read, instead of a second in-memory copy.
		@Optional() @InjectDataSource() private readonly appDataSource: DataSource | undefined,
		private readonly typeOrmConfigService: TypeOrmConfigService,
		private readonly config: ConfigService,
		private readonly configService: ConfigurationService,
		private readonly employeeService: EmployeeService
	) {}

	/**
	 * This config is applied only for `yarn seed:*` type calls because
	 * that is when connection is created by this service itself.
	 */
	overrideDbConfig = {
		logging: true,
		logger: 'file', // Removes console logging, instead logs all queries in a file ormlogs.log
	};

	private async createConnection() {
		if (this.connection?.isInitialized) {
			return;
		}
		if (this.appDataSource?.isInitialized) {
			this.connection = this.appDataSource;
			return;
		}
		// Only reached when the service runs outside a Nest application context.
		try {
			this.log(`CONNECTING TO DATABASE ...`);
			const dbConnectOptions = await this.typeOrmConfigService.createTypeOrmOptions();
			this.connection = new DataSource({
				...dbConnectOptions,
				...this.overrideDbConfig,
				entities: Entities,
			} as DataSourceOptions);
			await this.connection.initialize();
		} catch (error) {
			await this.handleError(error, 'Unable to connect to database');
		}
	}

	tryExecute<T>(name: string, p: Promise<T>): Promise<T> | Promise<void> {
		(async () => {
			this.log(`SEEDING ${name}`);
		})();

		return (p as any).then(
			(x: T) => x,
			(error: Error) => {
				(async () => {
					this.log(`🛑 ERROR: ${error ? error.message : 'unknown'}`);
				})();
			}
		);
	}

	/**
	 * Seed data
	 */
	public async run(isDefault: boolean): Promise<void> {
		try {
			// Connect to database
			await this.createConnection();

			const count = await this.employeeService.count();

			if (count === 0) {
				// Reset database to start with new, fresh data
				await this.resetDatabase();

				// Seed data with mock / fake data
				await this.seedData(isDefault);

				console.log('Database Seed completed');
			} else {
				// Check if criteria exist — if not, seed employees (upsert) + criteria
				const criteriaCount = await this.connection
					.getRepository('JobSearchCriterion')
					.count();

				if (criteriaCount === 0) {
					console.log(
						`Found ${count} employees but 0 search criteria. ` +
						`Seeding employees (upsert) and criteria...`
					);
					await this.seedData(isDefault);
					console.log('Database Seed (criteria backfill) completed');
				} else {
					console.log(
						`Found ${count} employees and ${criteriaCount} criteria in DB. Seed will NOT proceed`
					);
				}
			}
		} catch (error) {
			await this.handleError(error);
		}
	}

	/**
	 * Seed data by Updating existed in DB
	 */
	public async runUpdate(isDefault: boolean): Promise<void> {
		try {
			// Connect to database
			await this.createConnection();

			const count = await this.employeeService.count();

			if (count === 0) {
				console.log(
					`Found no employees in DB. Seed start creating new records...`
				);

				// Reset database to start with new, fresh data
				await this.resetDatabase();

				// Seed data with mock / fake data
				await this.seedData(isDefault);

				console.log('Database Seed completed');
			} else {
				console.log(
					`Found ${count} employees in DB. Seed will proceed with Update of data in DB`
				);

				// Seed data with mock / fake data
				await this.seedData(isDefault);

				console.log('Database Seed Update completed');
			}
		} catch (error) {
			await this.handleError(error);
		}
	}

	/**
	 * Populate database with mock data
	 */
	private async seedData(isDefault: boolean): Promise<void> {
		try {
			this.log(
				`🌱 SEEDING ${
					this.configService.isProduction() ? 'PRODUCTION' : ''
				} DATABASE...`
			);

			await this.tryExecute(
				'Employees',
				createEmployees(this.connection)
			);

			await this.tryExecute(
				'Employees Job Search Criteria',
				createJobSearchCriteria(this.connection)
			);

			this.log(
				`✅ SEEDED ${
					this.configService.isProduction() ? 'PRODUCTION' : ''
				} DATABASE`
			);
		} catch (error) {
			await this.handleError(error);
		}
	}

	/**
	 * Retrieve entities metadata
	 */
	private async getEntities() {
		const entities: any = [];
		try {
			this.connection.entityMetadatas.forEach((entity) =>
				entities.push({
					name: entity.name,
					tableName: entity.tableName,
				})
			);
			return entities;
		} catch (error) {
			await this.handleError(
				error,
				'Unable to retrieve database metadata'
			);
		}
	}

	/**
	 * Cleans all the entities
	 * Removes all data from database
	 */
	private async cleanAll(entities: any) {
		try {
			for (const entity of entities) {
				const repository = this.connection.getRepository(entity.name);
				const truncateSql =
					['sqlite', 'sqljs', 'better-sqlite3'].includes(this.configService.dbType())
						? `DELETE FROM  "${entity.tableName}";`
						: `TRUNCATE  "${entity.tableName}" RESTART IDENTITY CASCADE;`;
				await repository.query(truncateSql);
			}
		} catch (error) {
			await this.handleError(error, 'Unable to clean database');
		}
	}

	/**
	 * Reset the database, truncate all tables (remove all data)
	 */
	private async resetDatabase() {
		const entities = await this.getEntities();
		await this.cleanAll(entities);
		this.log(`✅ RESET DATABASE SUCCESSFUL`);
	}

	private async handleError(error: Error, message?: string) {
		this.log(
			`🛑 ERROR: ${message ? message + '-> ' : ''} ${
				error ? error.message : ''
			}`
		);
		throw error;
	}
}
