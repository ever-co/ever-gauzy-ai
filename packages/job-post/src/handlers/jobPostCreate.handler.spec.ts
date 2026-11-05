import { JobPost } from '@packages/entities';
import { JobPostCreateCommandHandler } from './jobPostCreate.handler';
import { JobPostCreateCommand } from '../commands/jobPostCreate.command';
import { JobPostCreatedEvent } from '../events/jobPostCreated.event';
import { JobPostUpdatedEvent } from '../events/jobPostUpdated.event';

jest.mock('../jobPost.service', () => ({ JobPostService: class JobPostService {} }));

describe('JobPostCreateCommandHandler', () => {
	let jobPostService: { find: jest.Mock; saveMany: jest.Mock; updateMany: jest.Mock };
	let eventBus: { publish: jest.Mock };
	let handler: JobPostCreateCommandHandler;

	beforeEach(() => {
		jest.spyOn(console, 'log').mockImplementation(() => undefined);
		// `li-stored` is in the database already
		jobPostService = {
			find: jest.fn(async ({ where }) => (where.providerJobId === 'li-stored' ? [{ id: 'job-stored', providerCode: 'linkedin', providerJobId: 'li-stored' }] : [])),
			saveMany: jest.fn(async (jobs) => jobs),
			updateMany: jest.fn(async (jobs) => jobs),
		};
		eventBus = { publish: jest.fn() };
		handler = new JobPostCreateCommandHandler(jobPostService as any, eventBus as any);
	});

	afterEach(() => jest.restoreAllMocks());

	const post = (providerJobId: string) => ({ providerCode: 'linkedin', providerJobId, title: providerJobId }) as JobPost;

	it('publishes new posts for matching and stored ones (e.g. re-offered by source-db) for re-matching', async () => {
		const fresh = post('li-new');
		const stored = post('li-stored');

		await handler.execute(new JobPostCreateCommand([fresh, stored]));

		expect(jobPostService.saveMany).toHaveBeenCalledWith([fresh]);
		expect(jobPostService.updateMany).toHaveBeenCalledWith([expect.objectContaining({ id: 'job-stored' })]);
		expect(eventBus.publish).toHaveBeenCalledWith(new JobPostCreatedEvent([fresh]));
		expect(eventBus.publish).toHaveBeenCalledWith(new JobPostUpdatedEvent([stored]));
		expect(stored.id).toBe('job-stored');
	});

	it('publishes no update event when every post is new', async () => {
		await handler.execute(new JobPostCreateCommand([post('li-new')]));

		expect(eventBus.publish).toHaveBeenCalledTimes(1);
		expect(eventBus.publish.mock.calls[0][0]).toBeInstanceOf(JobPostCreatedEvent);
	});
});
