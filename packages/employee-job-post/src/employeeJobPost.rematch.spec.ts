// Mock langfuse to prevent ESM dynamic import errors in Jest
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({
		getPrompt: jest.fn(),
		shutdown: jest.fn(),
	})),
}));

jest.mock('langfuse-core', () => ({
	LangfuseMedia: jest.fn(),
}));

import { EmployeeJobPostService, matchingInputsChangedAt, matchingInputsFingerprint, REMATCH_TIMESTAMP_MARGIN_MS } from './employeeJobPost.service';
import { EmployeeJobPostCreateCommand } from './commands/employeeJobPostCreate.command';
import { EmployeeJobPost, JobPost } from '@packages/entities';

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

/**
 * Re-matching of posts that were already stored — what the `source-db` provider re-offers on every
 * crawl (and what live providers find again).
 */
describe('EmployeeJobPostService – rematch()', () => {
	let service: EmployeeJobPostService;
	let repo: any;
	let commandBus: any;
	let employeeService: any;
	let aiScoringService: any;
	let storedPosts: any[];

	/** A post stored 2 hours ago, as the database has it. */
	const storedPost = (overrides: any = {}) => ({
		id: 'job-1',
		providerCode: 'linkedin',
		providerJobId: 'li-1',
		title: 'Senior React Developer',
		description: 'React and TypeScript',
		isActive: true,
		isArchived: false,
		isExpired: false,
		createdAt: ago(2),
		updatedAt: ago(2),
		...overrides,
	});

	/** What the crawler hands over: the `source-db` provider re-offering the stored post. */
	const crawled = (id = 'job-1') => ({ id, providerCode: 'linkedin', providerJobId: 'li-1' }) as unknown as JobPost;

	/** An employee whose "react" criterion was added `criterionHoursAgo` hours ago. */
	const employee = (criterionHoursAgo: number, overrides: any = {}) => ({
		id: 'emp-1',
		tenantId: 'tenant-1',
		orgId: null,
		firstName: 'Ada',
		createdAt: ago(240),
		updatedAt: ago(240),
		jobSearchCriteria: [
			{ id: 'crit-react', keyword: 'react', isActive: true, isArchived: false, createdAt: ago(criterionHoursAgo), updatedAt: ago(criterionHoursAgo) },
		],
		...overrides,
	});

	const scored = (matchScore: number) => ({
		matchScore,
		skillsEvidence: [],
		riskFlags: [],
		budgetFit: 'good_fit',
		recommendedAction: 'apply_now',
		explanation: 'fit',
	});

	beforeEach(() => {
		storedPosts = [storedPost()];
		repo = {
			find: jest.fn().mockResolvedValue([]), // no match stored yet
			// job_post: the creation-time lookup (`select`) and the full load return the stored rows asked for
			manager: {
				find: jest.fn().mockImplementation(async (_entity: unknown, { where }: any) =>
					storedPosts.filter((post) => (where.id.value as string[]).includes(post.id))
				),
			},
			metadata: { columns: [], relations: [], connection: { options: { type: '' } }, target: EmployeeJobPost },
		};
		// the create command returns the matches it stored
		commandBus = { execute: jest.fn().mockImplementation(async (command: EmployeeJobPostCreateCommand) => command.employeeJobPosts) };
		employeeService = { getActiveWithJobSearchCriteria: jest.fn().mockResolvedValue([employee(1)]) };
		aiScoringService = { scoreMatch: jest.fn().mockResolvedValue(scored(85)) };

		service = new EmployeeJobPostService(
			repo,
			commandBus,
			employeeService,
			aiScoringService,
			{
				aiMatchThreshold: () => 60,
				aiScoringModel: () => 'openai/gpt-4o-mini',
				novuMatchNotifyThreshold: () => 101,
			} as any,
			{ sendMatchAlert: jest.fn() } as any,
			{ publish: jest.fn() } as any,
		);
	});

	/** The calls that load stored posts in full (the creation-time lookup selects two columns). */
	const fullLoads = () => repo.manager.find.mock.calls.filter(([, options]: [unknown, any]) => !options.select);

	it('matches a stored post against criteria added after it was stored, using the stored row', async () => {
		const summary = await service.rematch([crawled()]);

		// the stored state is read (the crawled object lacks isActive & co.)
		expect(fullLoads()).toHaveLength(1);
		expect(fullLoads()[0][1].where).toEqual(expect.objectContaining({ isActive: true, isArchived: false }));
		expect(aiScoringService.scoreMatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1', title: 'Senior React Developer' }), expect.objectContaining({ id: 'emp-1' }));

		const [command] = commandBus.execute.mock.calls[0];
		expect(command).toBeInstanceOf(EmployeeJobPostCreateCommand);
		expect(command.employeeJobPosts).toEqual([expect.objectContaining({ employeeId: 'emp-1', jobPostId: 'job-1', tenantId: 'tenant-1', matchScore: 85 })]);
		// stored now (not backdated to the post), so the digest and the dashboard count it
		expect(command.employeeJobPosts[0].createdAt).toBeUndefined();
		expect(summary).toEqual({ created: 1, unscored: 0 });
	});

	it('leaves employees alone whose criteria and profile did not change since the post was stored', async () => {
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(5)]); // criterion older than the post

		const summary = await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();
		expect(commandBus.execute).not.toHaveBeenCalled();
		expect(summary).toEqual({ created: 0, unscored: 0 });
	});

	it('does not load the posts in full when every pair was evaluated already', async () => {
		await service.rematch([crawled()]);
		repo.manager.find.mockClear();

		await service.rematch([crawled()]);

		expect(fullLoads()).toHaveLength(0);
	});

	it('evaluates each stored post the first time a crawl brings it, also when crawls bring different posts', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30)); // rejected pairs are remembered too
		storedPosts = [storedPost({ id: 'job-1' }), storedPost({ id: 'job-2', providerJobId: 'li-2' })];

		await service.rematch([crawled('job-1')]);
		await service.rematch([crawled('job-2')]);
		await service.rematch([crawled('job-1'), crawled('job-2')]);

		expect(aiScoringService.scoreMatch.mock.calls.map(([job]: [JobPost]) => job.id)).toEqual(['job-1', 'job-2']);
	});

	it('matches an expired post that reopened later (it was never evaluated while expired)', async () => {
		storedPosts = [storedPost({ isExpired: true })];
		await service.rematch([crawled()]);
		expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();

		storedPosts = [storedPost({ isExpired: false })]; // the liveness check found it open again
		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
	});

	it('re-evaluates a previously irrelevant post after the last criterion was deleted (the delete hook bumps the employee)', async () => {
		// "react" was added before the post was stored, so the post was matched (and rejected) as a new post
		storedPosts = [storedPost({ id: 'job-py', title: 'Python developer', description: 'Django', createdAt: ago(1) })];
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(2)]);
		await service.rematch([crawled('job-py')]);
		expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();

		// the criterion is deleted: no criteria left (every active post is relevant) and, through
		// CriterionDeleteOneTouchesEmployeeHook, the employee's updatedAt is newer than the post
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(2, { jobSearchCriteria: [], updatedAt: new Date() })]);
		await service.rematch([crawled('job-py')]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-py' }), expect.objectContaining({ id: 'emp-1' }));
	});

	it('re-evaluates when a pass ran between the owner bump and the criterion delete (same timestamp, fewer criteria)', async () => {
		storedPosts = [storedPost({ id: 'job-py', title: 'Python developer', description: 'Django', createdAt: ago(1) })];
		const bumpedAt = new Date();
		// the delete hook bumped updatedAt, the criterion is not deleted yet: "react" still filters the post out
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(2, { updatedAt: bumpedAt })]);
		await service.rematch([crawled('job-py')]);
		expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();

		// the delete committed: same updatedAt, no criteria left
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(2, { updatedAt: bumpedAt, jobSearchCriteria: [] })]);
		await service.rematch([crawled('job-py')]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-py' }), expect.objectContaining({ id: 'emp-1' }));
	});

	it('does not score a pair again that the new-post pass just evaluated with the same inputs', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));
		// the criterion changed 1 hour ago, between storing this post (2 hours ago) and matching it as new
		const post = storedPost();
		await service.match([post as unknown as JobPost]);
		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);

		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
	});

	it('runs new-post and re-match passes one after the other', async () => {
		let release: (value: unknown) => void = () => undefined;
		aiScoringService.scoreMatch.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
		const rematching = service.rematch([crawled()]);
		await new Promise((resolve) => setImmediate(resolve));
		expect(employeeService.getActiveWithJobSearchCriteria).toHaveBeenCalledTimes(1);

		const matching = service.match([storedPost({ id: 'job-new', createdAt: new Date() }) as unknown as JobPost]);
		await new Promise((resolve) => setImmediate(resolve));
		// the new-post pass waits: it has not even loaded the employees yet
		expect(employeeService.getActiveWithJobSearchCriteria).toHaveBeenCalledTimes(1);

		release(scored(85));
		await rematching;
		await matching;
		expect(employeeService.getActiveWithJobSearchCriteria).toHaveBeenCalledTimes(2);
	});

	it('waits for every employee before reporting a failure, and evaluates the failed one again next time', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(1), employee(1, { id: 'emp-2' })]);
		let release: (value: unknown) => void = () => undefined;
		aiScoringService.scoreMatch.mockImplementation((_job: JobPost, emp: { id: string }) =>
			emp.id === 'emp-2' ? new Promise((resolve) => (release = resolve)) : Promise.resolve(scored(30))
		);
		repo.find.mockImplementation(async ({ where }: any) => {
			if (where.employeeId === 'emp-1') throw new Error('db hiccup');
			return [];
		});

		let failed = false;
		const pass = service.rematch([crawled()]).catch((error: Error) => {
			failed = true;
			return error;
		});
		await new Promise((resolve) => setImmediate(resolve));
		expect(failed).toBe(false); // emp-2 is still being scored
		release(scored(30));
		expect(((await pass) as Error).message).toBe('db hiccup');

		// emp-2's pair is settled; emp-1's is not
		repo.find.mockResolvedValue([]);
		aiScoringService.scoreMatch.mockReset().mockResolvedValue(scored(30));
		await service.rematch([crawled()]);
		expect(aiScoringService.scoreMatch.mock.calls.map(([, emp]: [JobPost, { id: string }]) => emp.id)).toEqual(['emp-1']);
	});

	it('never stores a second match for a pair that already has one', async () => {
		repo.find.mockResolvedValue([{ id: 'ejp-1', jobPostId: 'job-1' }]);

		const summary = await service.rematch([crawled()]);

		expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: 'emp-1' }) }));
		expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();
		expect(commandBus.execute).not.toHaveBeenCalled();
		expect(summary.created).toBe(0);
	});

	it('scores a rejected pair once, not again on every crawl that re-offers the post', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30)); // below AI_MATCH_THRESHOLD: nothing is stored

		await service.rematch([crawled()]);
		await service.rematch([crawled()]);
		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
		expect(commandBus.execute).not.toHaveBeenCalled();
	});

	it('runs overlapping passes one after the other, so they do not score the same pair twice', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));

		await Promise.all([service.rematch([crawled()]), service.rematch([crawled()])]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
	});

	it('picks up a criterion changed after the previous pass', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));
		await service.rematch([crawled()]);

		const later = employee(1);
		later.jobSearchCriteria[0].keyword = 'react developer';
		later.jobSearchCriteria[0].updatedAt = new Date(Date.now() + 1000);
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([later]);
		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(2);
	});

	it('an employee reactivated (or changed and changed back) between passes gets the posts stored meanwhile', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));
		storedPosts = [storedPost({ id: 'job-old', createdAt: ago(6) }), storedPost({ id: 'job-meanwhile', providerJobId: 'li-2', createdAt: ago(2) })];
		const before = employee(5, { updatedAt: ago(5) });
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([before]);
		await service.rematch([crawled('job-old'), crawled('job-meanwhile')]);
		expect(aiScoringService.scoreMatch.mock.calls.map(([job]: [JobPost]) => job.id)).toEqual(['job-old']);

		// deactivated after that pass (job-meanwhile was stored then and matched to nobody), reactivated
		// before the next one: same matching inputs, newer updatedAt
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([{ ...before, updatedAt: ago(1) }]);
		await service.rematch([crawled('job-old'), crawled('job-meanwhile')]);

		expect(aiScoringService.scoreMatch.mock.calls.map(([job]: [JobPost]) => job.id)).toEqual(['job-old', 'job-meanwhile']);
	});

	it('does not score a pair again when only timestamps moved (e.g. the owner bump before a delete, an unrelated edit)', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));
		await service.rematch([crawled()]);

		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(1, { updatedAt: new Date() })]);
		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
	});

	it('catches a change that kept the old timestamps (a deleted criterion, a client-set timestamp): every stored post is concerned', async () => {
		storedPosts = [storedPost({ id: 'job-py', title: 'Python developer', description: 'Django', createdAt: ago(1) })];
		const before = employee(2);
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([before]);
		await service.rematch([crawled('job-py')]);
		expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();

		// the very same timestamps, other content: the criterion now asks for Python
		const edited = { ...before, jobSearchCriteria: [{ ...before.jobSearchCriteria[0], keyword: 'python' }] };
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([edited]);
		await service.rematch([crawled('job-py')]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-py' }), expect.objectContaining({ id: 'emp-1' }));
	});

	it('includes posts stored at, or just after, the timestamp of the change (transaction start, clock precision)', async () => {
		const changed = ago(3);
		storedPosts = [
			storedPost({ id: 'job-same-ms', createdAt: new Date(changed.getTime()) }),
			storedPost({ id: 'job-30s-later', providerJobId: 'li-2', createdAt: new Date(changed.getTime() + 30 * 1000) }),
			storedPost({ id: 'job-later', providerJobId: 'li-3', createdAt: new Date(changed.getTime() + REMATCH_TIMESTAMP_MARGIN_MS + 1000) }),
		];
		const emp = employee(3);
		emp.jobSearchCriteria[0].createdAt = changed;
		emp.jobSearchCriteria[0].updatedAt = changed;
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([emp]);

		await service.rematch([crawled('job-same-ms'), crawled('job-30s-later'), crawled('job-later')]);

		// the last one was stored well after the change: it was matched against these inputs as a new post
		expect(aiScoringService.scoreMatch.mock.calls.map(([job]: [JobPost]) => job.id).sort()).toEqual(['job-30s-later', 'job-same-ms']);
	});

	it('compares stored timestamps with stored timestamps: a database clock ahead of the API does not re-score', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(-1)]); // stamped an hour "in the future"

		await service.rematch([crawled()]);
		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
	});

	it('compares stored timestamps with stored timestamps: a database clock behind the API misses no change', async () => {
		aiScoringService.scoreMatch.mockResolvedValue(scored(30));
		storedPosts = [storedPost({ createdAt: ago(10) })];
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee(5)]);
		await service.rematch([crawled()]);

		// saved after that pass, but stamped (by a clock running behind) before this process's "now"
		const edited = employee(4);
		edited.jobSearchCriteria[0].keyword = 'react developer';
		employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([edited]);
		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(2);
	});

	it('skips expired posts and posts the employee is not interested in', async () => {
		storedPosts = [
			storedPost({ id: 'job-expired', isExpired: true }),
			storedPost({ id: 'job-other', title: 'Accountant', description: 'Bookkeeping' }),
		];

		await service.rematch([crawled('job-expired'), crawled('job-other')]);

		expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();
	});

	it('scores each post once when the crawl hands it over twice', async () => {
		await service.rematch([crawled(), crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
		expect(commandBus.execute.mock.calls[0][0].employeeJobPosts).toHaveLength(1);
	});

	it('reports only the matches the create command really stored', async () => {
		commandBus.execute.mockResolvedValue([]); // a concurrent pass stored the pair first

		const summary = await service.rematch([crawled()]);

		expect(summary).toEqual({ created: 0, unscored: 0 });
	});

	it('counts the matches stored without an AI score', async () => {
		aiScoringService.scoreMatch.mockRejectedValue(new Error('rate limited'));

		const summary = await service.rematch([crawled()]);

		expect(summary).toEqual({ created: 1, unscored: 1 });
	});

	it('does nothing for posts without an id', async () => {
		const summary = await service.rematch([{ providerCode: 'linkedin' } as JobPost]);

		expect(employeeService.getActiveWithJobSearchCriteria).not.toHaveBeenCalled();
		expect(summary).toEqual({ created: 0, unscored: 0 });
	});

	it('keeps working after a failed pass, and evaluates its employees again', async () => {
		employeeService.getActiveWithJobSearchCriteria.mockRejectedValueOnce(new Error('db down'));

		await expect(service.rematch([crawled()])).rejects.toThrow('db down');
		await service.rematch([crawled()]);

		expect(aiScoringService.scoreMatch).toHaveBeenCalledTimes(1);
	});
});

describe('matchingInputsChangedAt()', () => {
	it('is the latest of the employee and criteria timestamps', () => {
		const latest = new Date('2026-10-30T10:00:00Z');
		expect(
			matchingInputsChangedAt({
				createdAt: new Date('2026-01-01T00:00:00Z'),
				updatedAt: new Date('2026-02-01T00:00:00Z'),
				jobSearchCriteria: [
					{ createdAt: new Date('2026-03-01T00:00:00Z'), updatedAt: latest },
					{ createdAt: new Date('2026-04-01T00:00:00Z') },
				],
			} as any),
		).toEqual(latest);
	});

	it('is undefined without any timestamp', () => {
		expect(matchingInputsChangedAt({} as any)).toBeUndefined();
	});
});

describe('matchingInputsFingerprint()', () => {
	const base = () =>
		({
			firstName: 'Ada',
			bio: 'TypeScript',
			preferredRate: '50.00',
			updatedAt: new Date('2026-01-01'),
			jobSearchCriteria: [
				{ id: 'c-1', keyword: 'react', isActive: true, isArchived: false, updatedAt: new Date('2026-01-01') },
				{ id: 'c-2', keyword: 'node', isActive: true, isArchived: false },
			],
		}) as any;

	it('ignores timestamps and the order of the criteria', () => {
		const other = base();
		other.updatedAt = new Date('2026-06-01');
		other.jobSearchCriteria = [other.jobSearchCriteria[1], { ...other.jobSearchCriteria[0], updatedAt: new Date() }];
		expect(matchingInputsFingerprint(other)).toBe(matchingInputsFingerprint(base()));
	});

	it('changes with every matching input', () => {
		const changes: Array<(e: any) => void> = [
			(e) => (e.jobSearchCriteria[0].keyword = 'vue'),
			(e) => (e.jobSearchCriteria[0].isActive = false),
			(e) => (e.jobSearchCriteria[0].isArchived = true),
			(e) => (e.jobSearchCriteria[0].occupation = 'Developer'),
			(e) => (e.jobSearchCriteria[0].category = 'Web'),
			(e) => e.jobSearchCriteria.pop(),
			(e) => (e.preferredRate = '60.00'),
			(e) => (e.bio = 'Go'),
			(e) => (e.skillsSummary = 'Go'),
			(e) => (e.experienceSummary = '10 years'),
			(e) => (e.jobType = 'hourly'),
			(e) => (e.lastName = 'Lovelace'),
		];
		for (const change of changes) {
			const other = base();
			change(other);
			expect(matchingInputsFingerprint(other)).not.toBe(matchingInputsFingerprint(base()));
		}
	});
});
