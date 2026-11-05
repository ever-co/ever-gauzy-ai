import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthService } from '@packages/health/health.service';

describe('AppController', () => {
	let appController: AppController;
	let appService: jest.Mocked<AppService>;
	let healthService: { check: jest.Mock };

	beforeEach(async () => {
		const mockAppService = {
			ping: jest.fn().mockResolvedValue(undefined),
			onApplicationBootstrap: jest.fn(),
		};

		const app: TestingModule = await Test.createTestingModule({
			controllers: [AppController],
			providers: [
				{ provide: AppService, useValue: mockAppService },
				{ provide: HealthService, useValue: { check: jest.fn() } },
			],
		}).compile();
		healthService = app.get(HealthService);

		appController = app.get<AppController>(AppController);
		appService = app.get(AppService);
	});

	describe('get()', () => {
		it('should return "Gauzy AI API"', () => {
			expect(appController.get()).toBe('Gauzy AI API');
		});
	});

	describe('health()', () => {
		it('reports what the database check says (ok when SELECT 1 answers)', async () => {
			healthService.check.mockResolvedValue({ status: 'ok', uptime: 12, version: '0.1.0', dbConnected: true, timestamp: new Date('2026-11-01T10:00:00Z') });
			const result = await appController.health();

			expect(result).toEqual(
				expect.objectContaining({
					status: 'ok',
					dbConnected: true,
					timestamp: expect.any(String),
					uptime: expect.any(Number),
					version: expect.any(String),
				})
			);
			expect(result.timestamp).toBe('2026-11-01T10:00:00.000Z');
		});

		it('is degraded when the database does not answer', async () => {
			healthService.check.mockResolvedValue({ status: 'degraded', uptime: 12, version: '0.1.0', dbConnected: false, timestamp: new Date() });
			await expect(appController.health()).resolves.toMatchObject({ status: 'degraded', dbConnected: false });
		});
	});
});
