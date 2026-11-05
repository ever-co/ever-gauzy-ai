// Mock langfuse to prevent ESM dynamic import errors in Jest (the module graph includes AiService)
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({ getPrompt: jest.fn(), shutdown: jest.fn() })),
}));
jest.mock('langfuse-core', () => ({ LangfuseMedia: jest.fn() }));

import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Entities } from '@packages/config/database';
import { WatchedColumnsQueryService } from '@packages/core/crud/watched-columns-query.service';
import { EmployeeJobApplicationModule } from '@packages/employeeJobApplication/employeeJobApplication.module';
import { EmployeeJobApplicationResolver } from '@packages/employeeJobApplication/resolvers/employeeJobApplication.resolver';
import { EmployeeJobApplicationSubscriber } from '@packages/employeeJobApplication/employeeJobApplication.subscriber';
import { AutomationTaskModule } from './automationTask.module';
import { AutomationTaskResolver } from './resolvers/automationTask.resolver';
import { AutomationTaskSubscriber } from './automationTask.subscriber';

/**
 * The wiring the notifications rely on: both GraphQL resolvers of each entity (the module's
 * auto-generated one and the custom one) use the WatchedColumnsQueryService, and each subscriber
 * is registered on the DataSource exactly once.
 */
describe('AutomationTaskModule / EmployeeJobApplicationModule wiring', () => {
	let moduleRef: TestingModule;

	beforeAll(async () => {
		moduleRef = await Test.createTestingModule({
			imports: [
				DiscoveryModule,
				TypeOrmModule.forRoot({
					type: 'sqljs',
					entities: Entities,
					synchronize: true,
					invalidWhereValuesBehavior: { undefined: 'ignore' },
				} as any),
				EmployeeJobApplicationModule,
				AutomationTaskModule,
			],
		}).compile();
		await moduleRef.init();
	});

	afterAll(async () => {
		await moduleRef?.close();
	});

	it('serves updateMany through the watched-columns query service', () => {
		const resolverService = (resolver: object) => (resolver as { service: unknown }).service;
		const autoResolverService = (name: string) => {
			const resolvers = moduleRef.get(DiscoveryService).getProviders().filter((wrapper) => wrapper.name === name);
			expect(resolvers).toHaveLength(1);
			// the auto-generated resolver wraps the entity's query service in an assembler service
			return (resolverService(resolvers[0].instance) as { queryService: unknown }).queryService;
		};

		expect(resolverService(moduleRef.get(AutomationTaskResolver, { strict: false }))).toBeInstanceOf(WatchedColumnsQueryService);
		expect(autoResolverService('AutomationTaskDTOAutoResolver')).toBeInstanceOf(WatchedColumnsQueryService);

		expect(resolverService(moduleRef.get(EmployeeJobApplicationResolver, { strict: false }))).toBeInstanceOf(WatchedColumnsQueryService);
		expect(autoResolverService('EmployeeJobApplicationDTOAutoResolver')).toBeInstanceOf(WatchedColumnsQueryService);
	});

	it('registers each subscriber once', () => {
		const subscribers = moduleRef.get<DataSource>(getDataSourceToken(), { strict: false }).subscribers;
		expect(subscribers.filter((subscriber) => subscriber instanceof AutomationTaskSubscriber)).toHaveLength(1);
		expect(subscribers.filter((subscriber) => subscriber instanceof EmployeeJobApplicationSubscriber)).toHaveLength(1);
	});
});
