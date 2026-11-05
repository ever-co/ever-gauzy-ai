import { resolveSchedules } from '@packages/config/schedules';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService (in-process cron)', () => {
	const registry = { addCronJob: jest.fn() };
	const crawlerService = { crawl: jest.fn(), runLivenessChecks: jest.fn() };
	const opsService = { scorePendingMatches: jest.fn(), sendDailyDigest: jest.fn(), cleanupStaleTasks: jest.fn() };
	const config = (localCronEnabled: boolean, overrides: Record<string, unknown> = {}) => ({
		localCronEnabled: () => localCronEnabled,
		schedules: () => resolveSchedules({}),
		scorePendingLimit: () => 25,
		schedulerTimezone: () => undefined,
		...overrides,
	});
	const build = (enabled: boolean, overrides: Record<string, unknown> = {}) =>
		new SchedulerService(registry as any, config(enabled, overrides) as any, crawlerService as any, opsService as any);
	const started: Array<{ stop: () => void }> = [];

	beforeEach(() => jest.resetAllMocks());
	afterEach(() => {
		for (const job of started.splice(0)) job.stop();
	});

	it('registers the five periodic jobs with the configured schedules when enabled', () => {
		const service = build(true);
		registry.addCronJob.mockImplementation((_name, job) => started.push(job));
		service.onModuleInit();
		expect(registry.addCronJob.mock.calls.map(([name]) => name)).toEqual([
			'crawl',
			'liveness-check',
			'score-pending-matches',
			'daily-digest',
			'cleanup-stale-tasks',
		]);
		expect(service.jobs().map((j) => j.cron)).toEqual(['*/10 * * * *', '0 */1 * * *', '15 * * * *', '0 8 * * *', '0 2 * * *']);
		expect(started.every((job: any) => job.waitForCompletion === true)).toBe(true);
	});

	it('runs whatever schedules the configuration resolves (explicit *_CRON over the minute intervals)', () => {
		const service = build(true, { schedules: () => resolveSchedules({ CRAWL_CRON: '*/7 * * * *', LIVENESS_CRON: '30 */2 * * *' }) });
		expect(service.jobs().slice(0, 2).map((j) => j.cron)).toEqual(['*/7 * * * *', '30 */2 * * *']);
	});

	it('passes the configured batch size to pending-match scoring', async () => {
		opsService.scorePendingMatches.mockResolvedValue({ scored: 0 });
		await build(true).jobs().find((j) => j.name === 'score-pending-matches')!.run();
		expect(opsService.scorePendingMatches).toHaveBeenCalledWith(25);
	});

	it('runs the jobs itself when Trigger.dev is configured but its plugin is switched off', () => {
		const env = { ...process.env };
		delete process.env.LOCAL_CRON_ENABLED;
		process.env.TRIGGER_DEV_ENABLED = 'true';
		try {
			const config = { localCronEnabled: () => false, triggerDevEnabled: () => true, crawlIntervalMinutes: () => 10, livenessCheckIntervalMinutes: () => 60, crawlCron: () => undefined, livenessCron: () => undefined, scorePendingCron: () => '15 * * * *', scorePendingLimit: () => 25, digestCron: () => '0 8 * * *', cleanupCron: () => '0 2 * * *', schedulerTimezone: () => undefined };
			expect(new SchedulerService(registry as any, config as any, crawlerService as any, opsService as any, { isEnabled: () => true }).isEnabled()).toBe(false);
			expect(new SchedulerService(registry as any, config as any, crawlerService as any, opsService as any, { isEnabled: () => false }).isEnabled()).toBe(true);
		} finally {
			process.env = env;
		}
	});

	it('registers nothing when in-process cron is off', () => {
		build(false).onModuleInit();
		expect(registry.addCronJob).not.toHaveBeenCalled();
	});

	it('a run calls the underlying service, a failure does not break the schedule, and runs never overlap', async () => {
		const service = build(true);
		let release: () => void = () => undefined;
		opsService.cleanupStaleTasks
			.mockRejectedValueOnce(new Error('db down'))
			.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
			.mockResolvedValueOnce({ tasksTimedOut: 1 });
		const job = service.jobs().find((j) => j.name === 'cleanup-stale-tasks')!;

		await service.runJob(job); // fails, logged
		const slow = service.runJob(job); // still running...
		await service.runJob(job); // ...so this tick is skipped
		expect(opsService.cleanupStaleTasks).toHaveBeenCalledTimes(2);
		release();
		await slow;
		await service.runJob(job); // runs again once the previous one finished
		expect(opsService.cleanupStaleTasks).toHaveBeenCalledTimes(3);
	});
});
