import { JobPost } from '@packages/entities';
import { MatchJobPostsToEmployeesCommandHandler } from './matchJobPostsToEmployees.handler';
import { MatchJobPostsToEmployeesCommand } from '../commands/matchJobPostsToEmployees.command';

jest.mock('@packages/trigger/trigger.service', () => ({ TriggerService: class TriggerService {} }));
jest.mock('../employeeJobPost.service', () => ({ EmployeeJobPostService: class EmployeeJobPostService {} }));

/** What happens when a crawl's matching pass completes. */
describe('MatchJobPostsToEmployeesCommandHandler', () => {
	const jobs = [{ id: 'job-1' }] as JobPost[];
	let service: { match: jest.Mock; rematch: jest.Mock };
	let triggerService: { isEnabled: jest.Mock; trigger: jest.Mock };
	const config = { scorePendingLimit: () => 50 } as any;

	beforeEach(() => {
		service = {
			match: jest.fn().mockResolvedValue({ created: 3, unscored: 2 }),
			rematch: jest.fn().mockResolvedValue({ created: 1, unscored: 1 }),
		};
		triggerService = { isEnabled: jest.fn().mockReturnValue(true), trigger: jest.fn().mockResolvedValue('run_1') };
	});

	const handler = (trigger: any = triggerService) => new MatchJobPostsToEmployeesCommandHandler(service as any, config, trigger);

	it('matches new posts against every employee', async () => {
		expect(await handler().execute(new MatchJobPostsToEmployeesCommand(jobs))).toEqual({ created: 3, unscored: 2 });
		expect(service.match).toHaveBeenCalledWith(jobs);
		expect(service.rematch).not.toHaveBeenCalled();
	});

	it('re-matches posts that were already stored (e.g. re-offered by source-db)', async () => {
		await handler().execute(new MatchJobPostsToEmployeesCommand(jobs, { existing: true }));
		expect(service.rematch).toHaveBeenCalledWith(jobs);
		expect(service.match).not.toHaveBeenCalled();
	});

	it('enqueues one delayed score-matches run for the matches stored without a score when Trigger.dev is enabled', async () => {
		await handler().execute(new MatchJobPostsToEmployeesCommand(jobs));
		expect(triggerService.trigger).toHaveBeenCalledTimes(1);
		expect(triggerService.trigger).toHaveBeenCalledWith('score-matches', { limit: 2 }, { delay: '5m' });
	});

	it('caps the enqueued run at SCORE_PENDING_LIMIT', async () => {
		service.match.mockResolvedValue({ created: 400, unscored: 400 });
		await handler().execute(new MatchJobPostsToEmployeesCommand(jobs));
		expect(triggerService.trigger).toHaveBeenCalledWith('score-matches', { limit: 50 }, { delay: '5m' });
	});

	it('enqueues nothing when Trigger.dev is disabled (the scheduled job scores them in-process)', async () => {
		triggerService.isEnabled.mockReturnValue(false);
		await handler().execute(new MatchJobPostsToEmployeesCommand(jobs));
		expect(triggerService.trigger).not.toHaveBeenCalled();
	});

	it('enqueues nothing when every stored match has a score', async () => {
		service.match.mockResolvedValue({ created: 3, unscored: 0 });
		await handler().execute(new MatchJobPostsToEmployeesCommand(jobs));
		expect(triggerService.trigger).not.toHaveBeenCalled();
	});

	it('works without the Trigger.dev module', async () => {
		await expect(handler(undefined).execute(new MatchJobPostsToEmployeesCommand(jobs))).resolves.toEqual({ created: 3, unscored: 2 });
	});

	it('does not fail the pass when enqueuing fails', async () => {
		triggerService.trigger.mockRejectedValue(new Error('Trigger.dev unreachable'));
		await expect(handler().execute(new MatchJobPostsToEmployeesCommand(jobs))).resolves.toEqual({ created: 3, unscored: 2 });
	});
});
