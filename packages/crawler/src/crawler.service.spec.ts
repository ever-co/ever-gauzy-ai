import { CommandBus } from '@nestjs/cqrs';
import { ConfigurationService } from '@packages/config';
import { EmployeeService } from '@packages/employee/employee.service';
import { CrawlerService } from './crawler.service';
import { JobPostService } from '@packages/jobPost/jobPost.service';

// Mock the cron module
jest.mock('cron', () => ({
	CronJob: jest.fn().mockImplementation((schedule, callback) => ({
		start: jest.fn(),
		_callback: callback,
	})),
}));

describe('CrawlerService', () => {
	let service: CrawlerService;
	let commandBus: jest.Mocked<CommandBus>;
	let configService: jest.Mocked<ConfigurationService>;
	let jobPostService: jest.Mocked<JobPostService>;
	let mockProvider: any;
	let employeeService: jest.Mocked<EmployeeService>;

	beforeEach(() => {
		commandBus = { execute: jest.fn().mockResolvedValue(undefined) } as any;
		configService = {
			isProduction: jest.fn().mockReturnValue(true),
			livenessCheckIntervalMinutes: jest.fn().mockReturnValue(60),
			crawlDefaultKeywords: jest.fn().mockReturnValue([]),
		} as any;
		jobPostService = {
			findStaleJobs: jest.fn().mockResolvedValue([]),
			checkLiveness: jest.fn(),
		} as any;

		employeeService = {
			getActiveWithJobSearchCriteria: jest.fn().mockResolvedValue([]),
		} as any;

		mockProvider = {
			providerName: 'test-provider',
			providerCode: 'test',
			isEnabled: jest.fn().mockResolvedValue(true),
			getJobs: jest.fn().mockResolvedValue([]),
		};

		service = new CrawlerService(
			commandBus,
			configService,
			jobPostService,
			employeeService,
			[mockProvider],
		);
	});

	const mockEmployeeWithCriteria = {
		id: 'emp-1',
		jobSearchCriteria: [
			{ isActive: true, isArchived: false, keyword: 'node', jobType: 'Hourly', category: 'Web' },
		],
	};

	describe('crawl()', () => {
		it('should crawl all enabled providers', async () => {
			const mockJobs = [{ id: 'job-1' }, { id: 'job-2' }];
			mockProvider.getJobs.mockResolvedValue(mockJobs);
			employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([mockEmployeeWithCriteria] as any);

			await service.crawl();

			expect(mockProvider.isEnabled).toHaveBeenCalled();
			expect(mockProvider.getJobs).toHaveBeenCalled();
			expect(commandBus.execute).toHaveBeenCalled();
		});

		it('searches once per tenant but dispatches each posting once (same posting from two tenants)', async () => {
			const posting = { providerCode: 'test', providerJobId: 'p-1', title: 'Node developer' };
			mockProvider.getJobsForCriteria = jest.fn().mockImplementation(async () => [
				{ ...posting },
				{ providerCode: 'test', providerJobId: undefined, title: 'no id' },
			]);
			employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([
				{ id: 'emp-1', jobSearchCriteria: [{ tenantId: 't-1', keyword: 'node', isActive: true, isArchived: false }] },
				{ id: 'emp-2', jobSearchCriteria: [{ tenantId: 't-2', keyword: 'node', isActive: true, isArchived: false }] },
			] as any);

			await service.crawl();

			// identical criteria of two tenants stay two searches (each with its tenant's credentials)
			expect(mockProvider.getJobsForCriteria).toHaveBeenCalledTimes(2);
			expect(mockProvider.getJobsForCriteria.mock.calls.map(([c]) => c.tenantId)).toEqual(['t-1', 't-2']);
			// ...but the shared posting is created once; posts without a provider id are all kept
			const { jobPosts } = commandBus.execute.mock.calls[0][0] as any;
			expect(jobPosts.filter((j: any) => j.providerJobId === 'p-1')).toHaveLength(1);
			expect(jobPosts.filter((j: any) => j.providerJobId === undefined)).toHaveLength(2);
		});

		it('keeps the search metadata of every copy of a posting (different keywords find the same job)', async () => {
			mockProvider.getJobsForCriteria = jest.fn().mockImplementation(async (criterion: any) => [
				{ providerCode: 'test', providerJobId: 'p-1', title: 'Full-stack developer', searchKeyword: criterion.keyword, searchCategory: criterion.keyword === 'frontend' ? 'Web' : 'APIs' },
			]);
			employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([
				{ id: 'emp-1', jobSearchCriteria: [{ tenantId: 't-1', keyword: 'frontend', category: 'Web', isActive: true, isArchived: false }] },
				{ id: 'emp-2', jobSearchCriteria: [{ tenantId: 't-1', keyword: 'backend', category: 'Web', isActive: true, isArchived: false }] },
			] as any);

			await service.crawl();

			expect(mockProvider.getJobsForCriteria).toHaveBeenCalledTimes(2);
			const { jobPosts } = commandBus.execute.mock.calls[0][0] as any;
			expect(jobPosts).toHaveLength(1);
			// the relevance filter matches on the combined terms, so the backend employee still gets the job
			expect(jobPosts[0]).toMatchObject({ providerJobId: 'p-1', searchKeyword: 'frontend, backend', searchCategory: 'Web, APIs' });
		});

		it('logs a failed persistence of the crawled jobs instead of raising an unhandled rejection', async () => {
			mockProvider.getJobs.mockResolvedValue([{ providerCode: 'test', providerJobId: 'p-1', title: 'x' }]);
			employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([mockEmployeeWithCriteria] as any);
			commandBus.execute.mockRejectedValue(new Error('bind message has 57319 parameter formats but 0 parameters'));
			const unhandled = jest.fn();
			process.on('unhandledRejection', unhandled);
			await service.crawl();
			await new Promise((r) => setImmediate(r));
			process.off('unhandledRejection', unhandled);
			expect(unhandled).not.toHaveBeenCalled();
		});

		it('should skip disabled providers', async () => {
			mockProvider.isEnabled.mockResolvedValue(false);
			employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([mockEmployeeWithCriteria] as any);

			await service.crawl();

			expect(mockProvider.getJobs).not.toHaveBeenCalled();
			expect(commandBus.execute).not.toHaveBeenCalled();
		});

		it('should handle provider errors without crashing', async () => {
			mockProvider.getJobs.mockRejectedValue(new Error('API timeout'));
			employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([mockEmployeeWithCriteria] as any);

			await expect(service.crawl()).resolves.toBeUndefined();
		});

		it('should not crawl when disabled', async () => {
			service.setEnabled(false);

			await service.crawl();

			expect(mockProvider.isEnabled).not.toHaveBeenCalled();
		});

		it('should not crawl when no providers registered', async () => {
			const emptyService = new CrawlerService(
				commandBus,
				configService,
				jobPostService,
				employeeService,
				[],
			);

			await emptyService.crawl();

			expect(commandBus.execute).not.toHaveBeenCalled();
		});
	});

	describe('runLivenessChecks()', () => {
		it('should check stale jobs and track results', async () => {
			const staleJobs = [
				{ id: 'stale-1' },
				{ id: 'stale-2' },
			] as any;
			jobPostService.findStaleJobs.mockResolvedValue(staleJobs);
			jobPostService.checkLiveness
				.mockResolvedValueOnce({ id: 'stale-1', isExpired: true } as any)
				.mockResolvedValueOnce({ id: 'stale-2', isExpired: false } as any);

			await service.runLivenessChecks();

			expect(jobPostService.findStaleJobs).toHaveBeenCalledWith(50);
			expect(jobPostService.checkLiveness).toHaveBeenCalledTimes(2);
			expect(jobPostService.checkLiveness).toHaveBeenCalledWith('stale-1');
			expect(jobPostService.checkLiveness).toHaveBeenCalledWith('stale-2');
		});

		it('should skip when no stale jobs found', async () => {
			jobPostService.findStaleJobs.mockResolvedValue([]);

			await service.runLivenessChecks();

			expect(jobPostService.checkLiveness).not.toHaveBeenCalled();
		});

		it('should skip when crawler is disabled', async () => {
			service.setEnabled(false);

			await service.runLivenessChecks();

			expect(jobPostService.findStaleJobs).not.toHaveBeenCalled();
		});

		it('should handle individual liveness check errors gracefully', async () => {
			const staleJobs = [{ id: 'stale-1' }, { id: 'stale-2' }] as any;
			jobPostService.findStaleJobs.mockResolvedValue(staleJobs);
			jobPostService.checkLiveness
				.mockRejectedValueOnce(new Error('Timeout'))
				.mockResolvedValueOnce({ id: 'stale-2', isExpired: false } as any);

			await expect(service.runLivenessChecks()).resolves.toBeUndefined();
			expect(jobPostService.checkLiveness).toHaveBeenCalledTimes(2);
		});
	});

	describe('setEnabled()', () => {
		it('should toggle the crawler enabled state', () => {
			service.setEnabled(false);
			// Verify crawl respects the flag
			const providers = service.getProviders();
			expect(providers).toHaveLength(1); // providers still registered but crawl won't run
		});
	});

	describe('default keywords (issue #3)', () => {
		it('crawls CRAWL_DEFAULT_KEYWORDS when no employee has search criteria, and skips without them', async () => {
			const provider = { providerName: 'p', providerCode: 'p', isEnabled: jest.fn().mockResolvedValue(true), getJobs: jest.fn().mockResolvedValue([]), getJobsForCriteria: jest.fn().mockResolvedValue([]) };
			employeeService.getActiveWithJobSearchCriteria.mockResolvedValue([{ id: 'e-1', tenantId: 't-1', jobSearchCriteria: [] }, { id: 'e-2', tenantId: 't-2', jobSearchCriteria: [] }, { id: 'e-3', tenantId: 't-1', jobSearchCriteria: [] }] as any);
			const withDefaults = new CrawlerService(commandBus, { ...configService, crawlDefaultKeywords: jest.fn().mockReturnValue(['React Developer', 'DevOps Engineer']) } as any, jobPostService, employeeService, [provider] as any);
			await withDefaults.crawl();
			// one search per default keyword and tenant, each carrying the tenant for its own credentials
			expect(provider.getJobsForCriteria.mock.calls.map(([c]) => `${c.tenantId}:${c.keyword}`)).toEqual(['t-1:React Developer', 't-1:DevOps Engineer', 't-2:React Developer', 't-2:DevOps Engineer']);

			provider.getJobsForCriteria.mockClear();
			const withoutDefaults = new CrawlerService(commandBus, configService, jobPostService, employeeService, [provider] as any);
			await withoutDefaults.crawl();
			expect(provider.getJobsForCriteria).not.toHaveBeenCalled();
		});
	});
});
