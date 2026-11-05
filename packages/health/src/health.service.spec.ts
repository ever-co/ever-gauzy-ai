import { HealthService } from './health.service';

describe('HealthService.check (database probe with a deadline)', () => {
	const build = (query: jest.Mock) => new HealthService({ query } as any);

	afterEach(() => {
		jest.useRealTimers();
		delete process.env.HEALTH_DB_TIMEOUT_MS;
	});

	it('is ok when SELECT 1 answers', async () => {
		const result = await build(jest.fn().mockResolvedValue([{ '?column?': 1 }])).check();
		expect(result).toMatchObject({ status: 'ok', dbConnected: true, uptime: expect.any(Number), version: expect.any(String), timestamp: expect.any(Date) });
	});

	it('is degraded when the query fails', async () => {
		await expect(build(jest.fn().mockRejectedValue(new Error('connection refused'))).check()).resolves.toMatchObject({ status: 'degraded', dbConnected: false });
	});

	it('is degraded when the query never answers (deadline, not a hang)', async () => {
		process.env.HEALTH_DB_TIMEOUT_MS = '50';
		const result = await build(jest.fn(() => new Promise(() => undefined))).check();
		expect(result).toMatchObject({ status: 'degraded', dbConnected: false });
	});

	it('repeated probes share the stalled query instead of piling up new ones, and probe again once it settles', async () => {
		process.env.HEALTH_DB_TIMEOUT_MS = '20';
		let settle: () => void = () => undefined;
		const query = jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => (settle = resolve))).mockResolvedValue([{ '?column?': 1 }]);
		const service = build(query);
		await expect(service.check()).resolves.toMatchObject({ dbConnected: false });
		await expect(service.check()).resolves.toMatchObject({ dbConnected: false });
		expect(query).toHaveBeenCalledTimes(1); // the second check waited on the same query
		settle();
		await new Promise((r) => setImmediate(r));
		await expect(service.check()).resolves.toMatchObject({ dbConnected: true });
		expect(query).toHaveBeenCalledTimes(2); // a fresh probe after the first one settled
	});
});
