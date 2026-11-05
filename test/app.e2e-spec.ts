import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Boots the whole application against the database given by DB_* (sql.js works:
 * `DB_TYPE=sqljs DB_SYNCHRONIZE=true APP_E2E=true yarn test:e2e test/app`). Opt-in because it
 * needs a database and takes a while; CI covers the same ground with its boot check.
 */
const describeIfEnabled = process.env.APP_E2E === 'true' ? describe : describe.skip;

describeIfEnabled('AppController (e2e)', () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { AppModule } = await import('../src/app.module');
		const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app?.close();
	});

	it('GET /api answers with the API name', () => {
		return request(app.getHttpServer()).get('/api').expect(200).expect('Gauzy AI API');
	});

	it('GET /api/health is public', () => {
		return request(app.getHttpServer()).get('/api/health').expect(200);
	});
});
