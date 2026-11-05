import {
	MAX_SCORING_ATTEMPTS,
	OpsService,
	PENDING_TASK_STATUSES,
	TIMED_OUT_TASK_STATUS,
	UNSCORABLE_EXPLANATION,
} from './ops.service';
import { AutomationTaskFinishedEvent } from '@packages/automationTask/events/automationTaskFinished.event';

describe('OpsService (periodic cross-tenant jobs)', () => {
	const matches = { find: jest.fn(), findOne: jest.fn(), findAndCount: jest.fn(), count: jest.fn(), update: jest.fn() };
	const applications = { count: jest.fn() };
	const tasks = { find: jest.fn(), update: jest.fn() };
	const employees = { find: jest.fn() };
	const aiScoringService = { scoreMatch: jest.fn() };
	const configurationService = { staleTaskTimeoutHours: () => 24, aiScoringModel: () => 'openai/gpt-5.2', scorePendingLimit: () => 50, openRouterApiKey: jest.fn(() => 'or-key') };
	const novuService = { isEnabled: jest.fn(), sendDailyDigest: jest.fn() };
	const eventBus = { publish: jest.fn() };
	const service = new OpsService(
		matches as any,
		applications as any,
		tasks as any,
		employees as any,
		aiScoringService as any,
		configurationService as any,
		novuService as any,
		eventBus as any
	);

	beforeEach(() => {
		jest.resetAllMocks();
		configurationService.openRouterApiKey.mockReturnValue('or-key');
		matches.update.mockResolvedValue({ affected: 1 });
	});

	describe('sendDailyDigest', () => {
		it('does nothing when Novu is not configured', async () => {
			novuService.isEnabled.mockReturnValue(false);
			const result = await service.sendDailyDigest(new Date('2026-10-30T08:00:00Z'));
			expect(result).toEqual({ since: '2026-10-30T08:00:00.000Z', recipientCount: 0, totalMatches: 0, skipped: 0 });
			expect(employees.find).not.toHaveBeenCalled();
		});

		it('notifies employees with activity (full count, top matches only), skips the quiet ones', async () => {
			novuService.isEnabled.mockReturnValue(true);
			employees.find.mockResolvedValue([
				{ id: 'e-1', firstName: 'A', userId: 'u-1', user: { email: 'a@example.com' } },
				{ id: 'e-2', firstName: 'B' },
			]);
			matches.findAndCount.mockImplementation(async ({ where }) =>
				where.employeeId === 'e-1'
					? [
							[
								{ jobPost: { title: 'React dev' }, matchScore: 91, providerCode: 'upwork' },
								{ jobPost: { title: 'Node dev' }, matchScore: 80, providerCode: 'linkedin' },
							],
							120, // more new matches than the detail limit
						]
					: [[], 0]
			);
			applications.count.mockResolvedValue(0);

			const result = await service.sendDailyDigest(new Date('2026-10-30T08:00:00Z'));

			expect(result).toMatchObject({ recipientCount: 1, totalMatches: 120, skipped: 1 });
			expect(novuService.sendDailyDigest).toHaveBeenCalledTimes(1);
			expect(novuService.sendDailyDigest).toHaveBeenCalledWith(
				{ id: 'e-1', firstName: 'A', lastName: undefined, userId: 'u-1', email: 'a@example.com' },
				{
					employeeId: 'e-1',
					newMatchCount: 120,
					applicationsSubmitted: 0,
					statusChanges: 0,
					topMatches: [
						{ jobTitle: 'React dev', matchScore: 91, providerCode: 'upwork' },
						{ jobTitle: 'Node dev', matchScore: 80, providerCode: 'linkedin' },
					],
				},
				{ throwOnError: true }
			);
			expect(matches.findAndCount.mock.calls[0][0]).toMatchObject({
				take: 5,
				order: { matchScore: { direction: 'DESC', nulls: 'LAST' } },
			});
		});

		it('counts submissions by appliedDate, and status changes as earlier applications submitted in the window', async () => {
			novuService.isEnabled.mockReturnValue(true);
			employees.find.mockResolvedValue([{ id: 'e-1' }]);
			matches.findAndCount.mockResolvedValue([[], 0]);
			applications.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
			const since = new Date('2026-10-30T08:00:00Z');
			await service.sendDailyDigest(since);
			const [submitted, changed] = applications.count.mock.calls.map(([q]) => q.where);
			expect(submitted.appliedDate._value).toEqual(since);
			expect(submitted).not.toHaveProperty('createdAt');
			expect(changed.appliedDate._value).toEqual(since);
			expect(changed.createdAt._type).toBe('lessThan');
			expect(novuService.sendDailyDigest.mock.calls[0][1]).toMatchObject({ applicationsSubmitted: 3, statusChanges: 1 });
		});

		it('counts a failed notification as skipped and carries on', async () => {
			novuService.isEnabled.mockReturnValue(true);
			employees.find.mockResolvedValue([{ id: 'e-1' }, { id: 'e-2' }]);
			matches.findAndCount.mockResolvedValue([[{ jobPost: { title: 'x' }, matchScore: 70, providerCode: 'upwork' }], 1]);
			applications.count.mockResolvedValue(0);
			novuService.sendDailyDigest.mockRejectedValueOnce(new Error('novu down')).mockResolvedValueOnce(undefined);

			const result = await service.sendDailyDigest();
			expect(result).toMatchObject({ recipientCount: 1, totalMatches: 1, skipped: 1 });
		});
	});

	describe('cleanupStaleTasks', () => {
		it('times out each pending task older than the threshold and publishes its outcome once', async () => {
			tasks.find.mockResolvedValue([
				{ id: 'task-1', status: 'open' },
				{ id: 'task-2', status: 'in_progress' },
				{ id: 'task-3', status: 'created' },
			]);
			tasks.update.mockResolvedValue({ affected: 1 });
			const before = Date.now();
			const result = await service.cleanupStaleTasks(12);
			expect(result).toEqual({ timeoutHours: 12, tasksTimedOut: 3 });
			const [{ where }] = tasks.find.mock.calls[0];
			expect(where.status._value).toEqual(PENDING_TASK_STATUSES);
			const cutoff: Date = where.createdAt._value;
			expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(12 * 3600 * 1000 - 1000);
			// one conditional update per task: it must still be pending when it is written
			expect(tasks.update).toHaveBeenCalledTimes(3);
			const [criteria, patch] = tasks.update.mock.calls[0];
			expect(criteria.id).toBe('task-1');
			expect(criteria.status._value).toEqual(PENDING_TASK_STATUSES);
			expect(patch.status).toBe(TIMED_OUT_TASK_STATUS);
			expect(patch.executedDate).toBeInstanceOf(Date);
			expect(eventBus.publish.mock.calls.map(([event]) => event)).toEqual([
				new AutomationTaskFinishedEvent('task-1', 'timeout', 'open'),
				new AutomationTaskFinishedEvent('task-2', 'timeout', 'in_progress'),
				new AutomationTaskFinishedEvent('task-3', 'timeout', 'created'),
			]);
		});

		it('neither counts nor notifies a task that finished between the read and the write', async () => {
			tasks.find.mockResolvedValue([{ id: 'task-1', status: 'open' }, { id: 'task-2', status: 'open' }]);
			tasks.update.mockResolvedValueOnce({ affected: 0 }).mockResolvedValueOnce({ affected: 1 });
			await expect(service.cleanupStaleTasks(12)).resolves.toEqual({ timeoutHours: 12, tasksTimedOut: 1 });
			expect(eventBus.publish).toHaveBeenCalledTimes(1);
			expect(eventBus.publish).toHaveBeenCalledWith(new AutomationTaskFinishedEvent('task-2', 'timeout', 'open'));
		});

		it('uses the configured default threshold', async () => {
			tasks.find.mockResolvedValue([]);
			await expect(service.cleanupStaleTasks()).resolves.toEqual({ timeoutHours: 24, tasksTimedOut: 0 });
			expect(tasks.update).not.toHaveBeenCalled();
			expect(eventBus.publish).not.toHaveBeenCalled();
		});

		it('rejects a non-positive threshold instead of timing out every open task', async () => {
			await expect(service.cleanupStaleTasks(-1)).rejects.toThrow(/timeoutHours must be a positive number/);
			await expect(service.cleanupStaleTasks(0)).rejects.toThrow(/positive/);
			await expect(service.cleanupStaleTasks(Number.NaN)).rejects.toThrow(/positive/);
			expect(tasks.find).not.toHaveBeenCalled();
			expect(tasks.update).not.toHaveBeenCalled();
		});
	});

	describe('scorePendingMatches', () => {
		const loaded: Record<string, unknown> = {
			'm-1': { id: 'm-1', jobPost: { title: 'a' }, employee: { id: 'e-1', jobSearchCriteria: [{ keyword: 'react' }] } },
			'm-2': { id: 'm-2', jobPost: { title: 'b' }, employee: { id: 'e-1' } },
			'm-3': { id: 'm-3', jobPost: null, employee: { id: 'e-1' } },
		};

		it('claims each match before the AI call, writes only the scoring fields, records failures and marks orphans', async () => {
			matches.find.mockResolvedValue([
				{ id: 'm-1', scoringAttempts: 0 },
				{ id: 'm-2', scoringAttempts: 2 },
				{ id: 'm-3', scoringAttempts: 0 },
			]);
			matches.count.mockResolvedValue(4);
			matches.findOne.mockImplementation(async ({ where }) => loaded[where.id]);
			aiScoringService.scoreMatch
				.mockResolvedValueOnce({ matchScore: 88, skillsEvidence: [], riskFlags: [], budgetFit: 'good', recommendedAction: 'apply', explanation: 'fits' })
				.mockRejectedValueOnce(new Error('model timeout'));

			const result = await service.scorePendingMatches(3);

			expect(result).toEqual({ scored: 1, failed: 1, unscorable: 1, skipped: 0, remaining: 4 });
			// claims abandoned on the final attempt are released first, with the interruption recorded
			const [release] = matches.update.mock.calls;
			expect(release[0]).toMatchObject({ scoringAttempts: { _type: 'moreThanOrEqual', _value: MAX_SCORING_ATTEMPTS }, scoringStartedAt: { _type: 'lessThan' } });
			expect(release[0].scoredAt._type).toBe('isNull');
			expect(release[1]).toEqual({ scoringStartedAt: null, scoringError: expect.stringMatching(/final attempt/) });
			// `remaining` is counted after the batch (the failed m-2 is eligible again), with the candidate predicate
			expect(matches.count).toHaveBeenCalledTimes(1);
			expect(matches.count.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...matches.update.mock.invocationCallOrder));
			const counted = matches.count.mock.calls[0][0].where;
			expect(counted.scoringAttempts._value).toBe(MAX_SCORING_ATTEMPTS);
			expect(counted.scoringStartedAt._type).toBe('or');
			expect(counted.scoredAt._type).toBe('isNull');
			// the candidate query: no orphans, not yet given up, not claimed by a live run
			const query = matches.find.mock.calls[0][0];
			expect(query).toMatchObject({ take: 3, order: { scoringAttempts: 'ASC', createdAt: 'ASC' } });
			expect(query.where.jobPostId._type).toBe('not');
			expect(query.where.employeeId._type).toBe('not');
			expect(query.where.scoringAttempts._value).toBe(MAX_SCORING_ATTEMPTS);
			expect(query.where.scoringStartedAt._type).toBe('or');
			// the scoring prompt gets the employee's search criteria
			expect(matches.findOne.mock.calls[0][0].relations).toEqual({ jobPost: true, employee: { jobSearchCriteria: true } });
			expect(aiScoringService.scoreMatch).toHaveBeenCalledWith(loaded['m-1']['jobPost'], loaded['m-1']['employee']);
			// claim = conditional update re-checking eligibility against the live row, before the AI call
			const claim = matches.update.mock.calls.find(([c]) => c.id === 'm-1' && c.scoredAt);
			expect(claim[0]).toMatchObject({ isArchived: false, scoringAttempts: 0 });
			expect(claim[0].scoringStartedAt._type).toBe('or');
			expect(claim[1]).toEqual({ scoringStartedAt: expect.any(Date), scoringAttempts: 1 });
			const claimedAt = claim[1].scoringStartedAt;
			// the scored match: a partial update, only while the claim is still ours
			const scored = matches.update.mock.calls.find(([c, patch]) => c.id === 'm-1' && patch.matchScore !== undefined);
			expect(scored[0]).toMatchObject({ id: 'm-1', scoringStartedAt: claimedAt });
			expect(scored[0].scoredAt._type).toBe('isNull'); // a rescore by the user meanwhile wins
			expect(scored[1]).toMatchObject({ matchScore: 88, explanation: 'fits', modelUsed: 'openai/gpt-5.2', scoredAt: expect.any(Date), scoringStartedAt: null, scoringError: null });
			expect(scored[1]).not.toHaveProperty('isArchived');
			// the failure keeps the error and releases our claim only; the attempt counter already advanced (2 → 3)
			const failed = matches.update.mock.calls.find(([c, patch]) => c.id === 'm-2' && patch.scoringError);
			expect(failed[0]).toMatchObject({ id: 'm-2', scoringStartedAt: expect.any(Date) });
			expect(failed[1]).toEqual({ scoringError: 'model timeout', scoringStartedAt: null });
			const claim2 = matches.update.mock.calls.find(([c]) => c.id === 'm-2' && c.scoredAt);
			expect(claim2[0].scoringAttempts).toBe(2);
			expect(claim2[1].scoringAttempts).toBe(3);
			// the orphan leaves the batch
			expect(matches.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-3', scoringStartedAt: expect.any(Date) }), { scoredAt: expect.any(Date), explanation: UNSCORABLE_EXPLANATION, scoringStartedAt: null });
		});

		it('skips a match another run claimed first and never calls the AI for it', async () => {
			matches.find.mockResolvedValue([{ id: 'm-1', scoringAttempts: 0 }]);
			matches.count.mockResolvedValue(0);
			matches.update.mockResolvedValueOnce({ affected: 0 }).mockResolvedValueOnce({ affected: 0 }); // release sweep; then: lost the claim
			const result = await service.scorePendingMatches(5);
			expect(result).toEqual({ scored: 0, failed: 0, unscorable: 0, skipped: 1, remaining: 0 });
			expect(matches.findOne).not.toHaveBeenCalled();
			expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();
		});

		it('discards a result whose claim expired and was taken over by another run', async () => {
			matches.find.mockResolvedValue([{ id: 'm-1', scoringAttempts: 0 }]);
			matches.count.mockResolvedValue(0);
			matches.findOne.mockResolvedValue(loaded['m-1']);
			aiScoringService.scoreMatch.mockResolvedValue({ matchScore: 70 });
			matches.update
				.mockResolvedValueOnce({ affected: 0 }) // release sweep
				.mockResolvedValueOnce({ affected: 1 }) // claim ok
				.mockResolvedValueOnce({ affected: 0 }); // completion lost
			const result = await service.scorePendingMatches(5);
			expect(result).toEqual({ scored: 0, failed: 0, unscorable: 0, skipped: 1, remaining: 0 });
		});

		it('reports a retryable failure as still remaining (recounted after the batch, not subtracted up front)', async () => {
			matches.find.mockResolvedValue([{ id: 'm-1', scoringAttempts: 0 }]);
			matches.findOne.mockResolvedValue(loaded['m-1']);
			aiScoringService.scoreMatch.mockRejectedValue(new Error('model timeout'));
			matches.count.mockResolvedValue(1); // the released match is eligible again
			const result = await service.scorePendingMatches(5);
			expect(result).toEqual({ scored: 0, failed: 1, unscorable: 0, skipped: 0, remaining: 1 });
		});

		it('fails before claiming anything when the match-scoring plugin is disabled', async () => {
			const gated = new OpsService(matches as any, applications as any, tasks as any, employees as any, aiScoringService as any, configurationService as any, novuService as any, eventBus as any, { isEnabled: () => false });
			await expect(gated.scorePendingMatches(5)).rejects.toThrow(/match-scoring plugin is disabled/);
			expect(matches.find).not.toHaveBeenCalled();
			expect(matches.update).not.toHaveBeenCalled();
		});

		it('fails before claiming anything when no AI key is configured (no attempts consumed)', async () => {
			configurationService.openRouterApiKey.mockReturnValue('');
			await expect(service.scorePendingMatches(5)).rejects.toThrow(/OPENROUTER_API_KEY/);
			expect(matches.find).not.toHaveBeenCalled();
			expect(matches.update).not.toHaveBeenCalled();
		});

		it('overlapping callers share one run instead of scoring the same rows twice', async () => {
			let release: (value: unknown[]) => void = () => undefined;
			matches.find.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
			matches.count.mockResolvedValue(0);
			const first = service.scorePendingMatches(5);
			const second = service.scorePendingMatches(5);
			while (!matches.find.mock.calls.length) await new Promise((r) => setImmediate(r)); // the run sweeps abandoned claims before querying
			release([]);
			await expect(first).resolves.toEqual({ scored: 0, failed: 0, unscorable: 0, skipped: 0, remaining: 0 });
			await expect(second).resolves.toBe(await first);
			expect(matches.find).toHaveBeenCalledTimes(1);
			// after it finished, a new call runs again
			matches.find.mockResolvedValue([]);
			await service.scorePendingMatches(5);
			expect(matches.find).toHaveBeenCalledTimes(2);
		});
	});
});
