import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JobPostService } from './jobPost.service';
import { JobPost } from '@packages/entities/jobPost.entity';
import { JOB_PROVIDERS_TOKEN, IJobProvider, LivenessResult } from '@packages/core-providers';
import { EverJobsProvider } from '@packages/provider-ever-jobs/ever-jobs.provider';
import { UpworkProvider, UPWORK_JOB_STATE_QUERY } from '@packages/provider-upwork/upwork.provider';
import { RequestContext } from '@packages/core/context/request-context';

// Mock the @dataui/crud-typeorm to avoid its deep TypeORM dependencies
jest.mock('@dataui/crud-typeorm', () => ({
	TypeOrmCrudService: class {
		protected repo: any;
		constructor(repo: any) {
			this.repo = repo;
		}
	},
}));

describe('JobPostService - Liveness Checks', () => {
	let service: JobPostService;
	let mockRepo: any;
	let mockProvider: IJobProvider & { verifyJob: jest.MockedFunction<(url: string) => Promise<LivenessResult>> };
	const matchedTenantsQuery = {
		select: jest.fn().mockReturnThis(),
		distinct: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		limit: jest.fn().mockReturnThis(),
		getRawMany: jest.fn().mockResolvedValue([]),
	};

	const mockJobPost: Partial<JobPost> = {
		id: 'job-123',
		title: 'React Developer',
		providerCode: 'ever-jobs',
		providerJobId: '~abc123',
		url: 'https://example.com/job/123',
		isExpired: false,
	};

	beforeEach(async () => {
		mockRepo = {
			findOne: jest.fn(),
			save: jest.fn((entity: any) => Promise.resolve({ ...entity })),
			find: jest.fn(),
			metadata: {
				columns: [],
				relations: [],
				connection: { options: { type: '' } },
			},
			manager: {
				transaction: jest.fn(),
				// tenants the post is matched for (EmployeeJobPost), offered to API-backed verifiers
				getRepository: jest.fn(() => ({ createQueryBuilder: () => matchedTenantsQuery })),
			},
			createQueryBuilder: jest.fn().mockReturnValue({
				select: jest.fn().mockReturnThis(),
				where: jest.fn().mockReturnThis(),
				getMany: jest.fn().mockResolvedValue([]),
			}),
		};

		mockProvider = {
			providerCode: 'ever-jobs',
			providerName: 'Ever Jobs API',
			getJobs: jest.fn(),
			isEnabled: jest.fn(),
			verifyJob: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				JobPostService,
				{
					provide: getRepositoryToken(JobPost),
					useValue: mockRepo,
				},
				{
					provide: JOB_PROVIDERS_TOKEN,
					useValue: [mockProvider],
				},
			],
		}).compile();

		service = module.get<JobPostService>(JobPostService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('checkLiveness', () => {
		it('should mark job as expired when verifyJob returns isOpen: false', async () => {
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost });
			mockProvider.verifyJob.mockResolvedValue({
				isOpen: false,
				reason: 'HTTP 404 — job page not found',
			});

			const result = await service.checkLiveness('job-123');

			expect(result.isExpired).toBe(true);
			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			expect(mockProvider.verifyJob).toHaveBeenCalledWith('https://example.com/job/123', expect.objectContaining({ id: 'job-123', providerCode: 'ever-jobs', providerJobId: '~abc123' }));
		});

		it('should keep job as active when verifyJob returns isOpen: true', async () => {
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost });
			mockProvider.verifyJob.mockResolvedValue({ isOpen: true });

			const result = await service.checkLiveness('job-123');

			expect(result.isExpired).toBe(false);
			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
		});

		it('should throw NotFoundException when job not found', async () => {
			mockRepo.findOne.mockResolvedValue(null);

			await expect(service.checkLiveness('nonexistent')).rejects.toThrow(
				NotFoundException
			);
		});

		it('should handle job with no URL', async () => {
			mockRepo.findOne.mockResolvedValue({
				...mockJobPost,
				url: null,
				sourceUrl: null,
			});

			const result = await service.checkLiveness('job-123');

			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			expect(mockProvider.verifyJob).not.toHaveBeenCalled();
		});

		it('should fall back to sourceUrl when url is null', async () => {
			mockRepo.findOne.mockResolvedValue({
				...mockJobPost,
				url: null,
				sourceUrl: 'https://fallback.com/job/456',
			});
			mockProvider.verifyJob.mockResolvedValue({ isOpen: true });

			await service.checkLiveness('job-123');

			expect(mockProvider.verifyJob).toHaveBeenCalledWith('https://fallback.com/job/456', expect.objectContaining({ url: 'https://fallback.com/job/456' }));
		});

		it('should handle provider with no verifyJob gracefully', async () => {
			const providerWithoutVerify: IJobProvider = {
				providerCode: 'ever-jobs',
				providerName: 'Basic Provider',
				getJobs: jest.fn(),
				isEnabled: jest.fn(),
				// No verifyJob method
			};

			const module = await Test.createTestingModule({
				providers: [
					JobPostService,
					{
						provide: getRepositoryToken(JobPost),
						useValue: mockRepo,
					},
					{
						provide: JOB_PROVIDERS_TOKEN,
						useValue: [providerWithoutVerify],
					},
				],
			}).compile();

			const svc = module.get<JobPostService>(JobPostService);
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost });

			const result = await svc.checkLiveness('job-123');

			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
		});

		it('should handle verifyJob errors gracefully', async () => {
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost });
			mockProvider.verifyJob.mockRejectedValue(
				new Error('Network timeout')
			);

			const result = await service.checkLiveness('job-123');

			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			// isExpired should remain false (original value, not changed on error)
			expect(result.isExpired).toBe(false);
		});

		it('should match provider by providerCode when the post has no ingestedBy (rows no provider stored)', async () => {
			const linkedinProvider: IJobProvider & { verifyJob: jest.Mock } = {
				providerCode: 'linkedin',
				providerName: 'LinkedIn',
				getJobs: jest.fn(),
				isEnabled: jest.fn(),
				verifyJob: jest.fn().mockResolvedValue({ isOpen: true }),
			};

			const module = await Test.createTestingModule({
				providers: [
					JobPostService,
					{
						provide: getRepositoryToken(JobPost),
						useValue: mockRepo,
					},
					{
						provide: JOB_PROVIDERS_TOKEN,
						useValue: [mockProvider, linkedinProvider],
					},
				],
			}).compile();

			const svc = module.get<JobPostService>(JobPostService);

			mockRepo.findOne.mockResolvedValue({
				...mockJobPost,
				providerCode: 'linkedin',
			});

			await svc.checkLiveness('job-123');

			expect(linkedinProvider.verifyJob).toHaveBeenCalled();
			expect(mockProvider.verifyJob).not.toHaveBeenCalled();
		});
	});

	describe('routing to the verifier of each channel', () => {
		const UPWORK_POSTING_ID = '2056488576136638272';
		const UPWORK_URL = 'https://www.upwork.com/jobs/~01abc';
		const jsonResponse = (body: unknown, status = 200) =>
			({ ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', json: async () => body }) as unknown as Response;
		const postingState = (status: string, closeResult?: string) =>
			jsonResponse({ data: { marketplaceJobPosting: { id: UPWORK_POSTING_ID, workFlowState: { status, closeResult } } } });

		let everJobs: EverJobsProvider;
		let everJobsVerify: jest.SpyInstance;
		let upwork: UpworkProvider;
		let upworkFetch: jest.Mock;
		let sourceConfigs: { getConfigForSource: jest.Mock };
		let sourceDb: IJobProvider;

		/** A JobPostService over the real providers (their network calls mocked). */
		const serviceWith = async (providers: IJobProvider[]) => {
			const module = await Test.createTestingModule({
				providers: [
					JobPostService,
					{ provide: getRepositoryToken(JobPost), useValue: mockRepo },
					{ provide: JOB_PROVIDERS_TOKEN, useValue: providers },
				],
			}).compile();
			return module.get<JobPostService>(JobPostService);
		};

		beforeEach(() => {
			everJobs = new EverJobsProvider({} as any, {} as any, {} as any, {} as any);
			everJobsVerify = jest.spyOn(everJobs, 'verifyJob').mockResolvedValue({ isOpen: true });
			upworkFetch = jest.fn();
			sourceConfigs = { getConfigForSource: jest.fn().mockResolvedValue(null) };
			upwork = new UpworkProvider({ apiUrl: 'https://api.test/graphql', tokenUrl: 'https://auth.test/token' }, sourceConfigs as any, upworkFetch as any);
			sourceDb = { providerCode: 'source-db', providerName: 'Local Database Cache', getJobs: jest.fn(), isEnabled: jest.fn() };
			for (const step of ['select', 'distinct', 'where', 'andWhere', 'limit'] as const) {
				matchedTenantsQuery[step].mockReturnThis();
			}
			matchedTenantsQuery.getRawMany.mockResolvedValue([]);
		});

		afterEach(() => jest.restoreAllMocks());

		it('sends a post Ever Jobs stored under its site code (linkedin) to the Ever Jobs verifier', async () => {
			everJobsVerify.mockResolvedValue({ isOpen: false, reason: 'HTTP 404 — job page not found' });
			const svc = await serviceWith([sourceDb, upwork, everJobs]);
			mockRepo.findOne.mockResolvedValue({
				...mockJobPost,
				providerCode: 'linkedin',
				providerJobId: 'linkedin-42',
				ingestedBy: 'ever-jobs',
				url: 'https://www.linkedin.com/jobs/view/42',
			});

			const result = await svc.checkLiveness('job-123');

			expect(result.isExpired).toBe(true);
			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			expect(everJobsVerify).toHaveBeenCalledWith(
				'https://www.linkedin.com/jobs/view/42',
				expect.objectContaining({ providerCode: 'linkedin', ingestedBy: 'ever-jobs', providerJobId: 'linkedin-42' })
			);
			expect(upworkFetch).not.toHaveBeenCalled();
		});

		it("background check: verifies an Upwork API post through the official API only, with a matched tenant's own credentials", async () => {
			matchedTenantsQuery.getRawMany.mockResolvedValue([{ tenantId: 't-other' }, { tenantId: 't-matched' }]);
			sourceConfigs.getConfigForSource.mockImplementation(async (_code: string, _org: unknown, tenantId?: string) =>
				tenantId === 't-matched' ? { tenantId: 't-matched', accessToken: 'matched-token' } : null
			);
			upworkFetch.mockResolvedValueOnce(postingState('CLOSED', '1'));
			const svc = await serviceWith([everJobs, upwork]);
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost, providerCode: 'upwork', providerJobId: UPWORK_POSTING_ID, ingestedBy: 'upwork', url: UPWORK_URL });

			const result = await svc.checkLiveness('job-123');

			expect(result.isExpired).toBe(true);
			expect(everJobsVerify).not.toHaveBeenCalled(); // no HEAD request to upwork.com
			expect(upworkFetch).toHaveBeenCalledTimes(1);
			const [apiUrl, init] = upworkFetch.mock.calls[0];
			expect(apiUrl).toBe('https://api.test/graphql');
			expect(JSON.parse(init.body)).toEqual({ query: UPWORK_JOB_STATE_QUERY, variables: { id: UPWORK_POSTING_ID } });
			expect(init.headers.Authorization).toBe('Bearer matched-token');
			// the tenants the post is matched for, in order (no request tenant in a background check)
			expect(sourceConfigs.getConfigForSource.mock.calls.map((call) => call[2])).toEqual(['t-other', 't-matched']);
			expect(matchedTenantsQuery.where).toHaveBeenCalledWith('ejp.jobPostId = :jobPostId', { jobPostId: 'job-123' });
			expect(matchedTenantsQuery.andWhere).toHaveBeenCalledWith(expect.any(Function)); // the usable-config filter (SQL: jobPost.service.tenants.spec.ts)
		});

		it("a request spends only the requesting tenant's credentials (or the deployment-wide ones), never a matched tenant's", async () => {
			jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('t-requesting');
			matchedTenantsQuery.getRawMany.mockResolvedValue([{ tenantId: 't-matched' }]);
			sourceConfigs.getConfigForSource.mockImplementation(async (_code: string, _org: unknown, tenantId?: string) =>
				tenantId === 't-matched' ? { tenantId: 't-matched', accessToken: 'matched-token' } : null
			);
			const svc = await serviceWith([everJobs, upwork]);
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost, providerCode: 'upwork', providerJobId: UPWORK_POSTING_ID, ingestedBy: 'upwork', url: UPWORK_URL });

			const result = await svc.checkLiveness('job-123');

			// the requester has no Upwork credentials and there are no deployment-wide ones: no verdict
			expect(result.isExpired).toBe(false);
			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			expect(upworkFetch).not.toHaveBeenCalled();
			expect(matchedTenantsQuery.getRawMany).not.toHaveBeenCalled();
			expect(sourceConfigs.getConfigForSource.mock.calls.map((call) => call[2])).toEqual(['t-requesting', undefined]);
		});

		it('checks an Upwork posting without any URL by its id (the URL guard only applies to URL-based checks)', async () => {
			upworkFetch.mockResolvedValueOnce(postingState('CLOSED', '2'));
			const viaEnv = new UpworkProvider({ apiUrl: 'https://api.test/graphql', accessToken: 'env-token' }, sourceConfigs as any, upworkFetch as any);
			const svc = await serviceWith([everJobs, viaEnv]);
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost, providerCode: 'upwork', providerJobId: UPWORK_POSTING_ID, ingestedBy: 'upwork', url: null, sourceUrl: null });

			const result = await svc.checkLiveness('job-123');

			expect(result.isExpired).toBe(true);
			expect(JSON.parse(upworkFetch.mock.calls[0][1].body).variables).toEqual({ id: UPWORK_POSTING_ID });

			// a URL-less post of the HEAD-check channel still has no verifier
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost, providerCode: 'linkedin', ingestedBy: 'ever-jobs', isExpired: false, url: null, sourceUrl: null });
			const unchecked = await svc.checkLiveness('job-123');
			expect(unchecked.isExpired).toBe(false);
			expect(unchecked.expiryCheckedAt).toBeInstanceOf(Date);
			expect(everJobsVerify).not.toHaveBeenCalled();
		});

		it('sends an Upwork posting relayed by Ever Jobs to the official API too, never to the HEAD check', async () => {
			upworkFetch.mockResolvedValueOnce(postingState('ACTIVE'));
			const viaEnv = new UpworkProvider({ apiUrl: 'https://api.test/graphql', accessToken: 'env-token' }, sourceConfigs as any, upworkFetch as any);
			const svc = await serviceWith([everJobs, viaEnv]);
			mockRepo.findOne.mockResolvedValue({
				...mockJobPost,
				isExpired: true, // a real verdict may reopen
				providerCode: 'upwork',
				providerJobId: `upwork-upwork-${UPWORK_POSTING_ID}`,
				ingestedBy: 'ever-jobs',
				url: UPWORK_URL,
			});

			const result = await svc.checkLiveness('job-123');

			expect(result.isExpired).toBe(false);
			expect(everJobsVerify).not.toHaveBeenCalled();
			expect(JSON.parse(upworkFetch.mock.calls[0][1].body).variables).toEqual({ id: UPWORK_POSTING_ID });
		});

		it('an Upwork post the official API cannot verify (no credentials) keeps isExpired as it is', async () => {
			const svc = await serviceWith([everJobs, upwork]);
			for (const isExpired of [false, true]) {
				mockRepo.findOne.mockResolvedValue({ ...mockJobPost, isExpired, providerCode: 'upwork', providerJobId: UPWORK_POSTING_ID, ingestedBy: 'upwork', url: UPWORK_URL });

				const result = await svc.checkLiveness('job-123');

				expect(result.isExpired).toBe(isExpired);
				expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			}
			expect(upworkFetch).not.toHaveBeenCalled();
			expect(everJobsVerify).not.toHaveBeenCalled();
		});

		it('without the Upwork provider an Upwork posting has no verifier (Ever Jobs does not take it over)', async () => {
			const svc = await serviceWith([everJobs]);
			mockRepo.findOne.mockResolvedValue({
				...mockJobPost,
				providerCode: 'upwork',
				providerJobId: `upwork-upwork-${UPWORK_POSTING_ID}`,
				ingestedBy: 'ever-jobs',
				url: UPWORK_URL,
			});

			const result = await svc.checkLiveness('job-123');

			expect(result.isExpired).toBe(false);
			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			expect(everJobsVerify).not.toHaveBeenCalled();
		});

		it('source-db verifies nothing: a source-db coded row only gets expiryCheckedAt, a re-served post keeps its channel', async () => {
			const svc = await serviceWith([sourceDb, everJobs, upwork]);

			mockRepo.findOne.mockResolvedValueOnce({ ...mockJobPost, isExpired: true, providerCode: 'source-db', ingestedBy: null });
			const legacy = await svc.checkLiveness('job-123');
			expect(legacy.isExpired).toBe(true);
			expect(legacy.expiryCheckedAt).toBeInstanceOf(Date);
			expect(everJobsVerify).not.toHaveBeenCalled();

			// a post the source-db provider handed back to the crawler is still the Ever Jobs post it was
			mockRepo.findOne.mockResolvedValueOnce({ ...mockJobPost, providerCode: 'indeed', ingestedBy: 'ever-jobs' });
			await svc.checkLiveness('job-123');
			expect(everJobsVerify).toHaveBeenCalledTimes(1);
		});

		it('an unknown channel (a post created through the API, no ingestedBy) is not verifiable and keeps isExpired', async () => {
			const svc = await serviceWith([sourceDb, everJobs, upwork]);
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost, isExpired: true, providerCode: 'acme-board', ingestedBy: null });

			const result = await svc.checkLiveness('job-123');

			expect(result.isExpired).toBe(true);
			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
			expect(everJobsVerify).not.toHaveBeenCalled();
			expect(upworkFetch).not.toHaveBeenCalled();
		});

		it('a result without a verdict (verified: false) keeps isExpired, whichever way it points', async () => {
			everJobsVerify.mockResolvedValue({ isOpen: true, verified: false, reason: 'Unexpected HTTP 403' });
			const svc = await serviceWith([everJobs]);
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost, isExpired: true, providerCode: 'glassdoor', ingestedBy: 'ever-jobs' });

			const result = await svc.checkLiveness('job-123');

			expect(result.isExpired).toBe(true); // not reopened by a failed check
			expect(result.expiryCheckedAt).toBeInstanceOf(Date);
		});

		it('ingestedBy wins over the site code: a linkedin post from Ever Jobs is not given to a provider coded linkedin', async () => {
			const linkedin = { providerCode: 'linkedin', providerName: 'LinkedIn', getJobs: jest.fn(), isEnabled: jest.fn(), verifyJob: jest.fn() };
			const svc = await serviceWith([linkedin, everJobs]);
			mockRepo.findOne.mockResolvedValue({ ...mockJobPost, providerCode: 'linkedin', ingestedBy: 'ever-jobs' });

			await svc.checkLiveness('job-123');

			expect(everJobsVerify).toHaveBeenCalled();
			expect(linkedin.verifyJob).not.toHaveBeenCalled();
		});
	});

	describe('bulk saves', () => {
		it('writes in chunks of 200 rows (one INSERT of a whole crawl exceeded the PostgreSQL bind-parameter limit)', async () => {
			const jobs = Array.from({ length: 3 }, (_, i) => ({ id: `j-${i}` })) as any;
			await service.saveMany(jobs);
			expect(mockRepo.save).toHaveBeenCalledWith(jobs, { chunk: 200 });
			await service.updateMany(jobs);
			expect(mockRepo.save).toHaveBeenLastCalledWith(jobs, { chunk: 200 });
		});
	});

	describe('findStaleJobs', () => {
		afterEach(() => delete process.env.LIVENESS_RECHECK_HOURS);

		it('selects never-checked posts and posts checked longer ago than LIVENESS_RECHECK_HOURS, never-checked first', async () => {
			mockRepo.find = jest.fn().mockResolvedValue([]);
			process.env.LIVENESS_RECHECK_HOURS = '12';
			const now = new Date('2026-11-01T12:00:00Z');
			await service.findStaleJobs(7, now);
			const options = mockRepo.find.mock.calls[0][0];
			expect(options.take).toBe(7);
			expect(options.where).toHaveLength(2);
			expect(options.where[0]).toMatchObject({ isExpired: false });
			expect(options.where[0].expiryCheckedAt._type).toBe('isNull');
			expect(options.where[1].expiryCheckedAt._type).toBe('lessThan');
			expect(options.where[1].expiryCheckedAt._value).toEqual(new Date('2026-11-01T00:00:00Z'));
			expect(options.order).toEqual({ expiryCheckedAt: { direction: 'ASC', nulls: 'FIRST' }, createdAt: 'ASC' });
		});
	});
});
