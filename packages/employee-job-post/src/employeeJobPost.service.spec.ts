// Every scoped lookup takes the tenant from the request context: pin it for the specs.
jest.mock('@packages/core/context', () => ({
	currentTenantWhere: () => ({ tenantId: 'tenant-1' }),
	requireCurrentTenantId: () => 'tenant-1',
	resolveTenantId: (requested?: string) => {
		if (requested && requested !== 'tenant-1') throw new Error('tenantId does not match the authenticated tenant');
		return 'tenant-1';
	},
	RequestContext: { currentTenantId: () => 'tenant-1' },
}));
// tenant-scope mock above
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CommandBus } from '@nestjs/cqrs';

// Mock all modules with dynamic imports (Node.js v24 compat)
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({ getPrompt: jest.fn() })),
}));
jest.mock('langfuse-core', () => ({}));
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@openrouter/ai-sdk-provider', () => ({
	createOpenRouter: jest.fn(() => jest.fn()),
}));
jest.mock('@novu/api', () => ({
	Novu: jest.fn().mockImplementation(() => ({
		trigger: jest.fn(),
	})),
}));

// Mock TypeOrmCrudService to avoid deep TypeORM initialization
jest.mock('@dataui/crud-typeorm', () => ({
	TypeOrmCrudService: class {
		constructor(protected repo: any) {}
	},
}));

import { EmployeeJobPostService } from './employeeJobPost.service';
import { EmployeeService } from '@packages/employee/employee.service';
import { AiScoringService } from '@packages/ai/ai-scoring.service';
import { ConfigurationService } from '@packages/config';
import { NovuService } from '@packages/novu';
import { EmployeeJobPost } from '@packages/entities';

describe('EmployeeJobPostService', () => {
	let service: EmployeeJobPostService;
	let aiScoringService: Partial<AiScoringService>;
	let employeeService: Partial<EmployeeService>;
	let configService: Partial<ConfigurationService>;
	let novuService: Partial<NovuService>;
	let commandBus: Partial<CommandBus>;
	let repo: any;

	const mockEmployee = {
		id: 'emp-1',
		tenantId: 'tenant-1',
		orgId: 'org-1',
		firstName: 'John',
		lastName: 'Doe',
		userId: 'user-1',
		isActive: true,
		isArchived: false,
		jobSearchCriteria: [
			{
				id: 'criteria-1',
				isActive: true,
				isArchived: false,
				category: 'Web Development',
				categoryId: null,
				jobType: 'Hourly',
				keyword: null,
				occupation: null,
				occupationId: null,
			},
		],
	};

	const mockJobPost = {
		id: 'job-1',
		title: 'Senior React Developer',
		description: 'Looking for a React expert.',
		providerCode: 'upwork',
		providerJobId: '~abc123',
		budget: '$60-$80/hr',
		jobType: 'Hourly',
		jobStatus: 'Open',
		searchCategory: 'Web Development',
		searchCategoryId: null,
		searchJobType: 'Hourly',
		searchKeyword: null,
		searchOccupation: null,
		searchOccupationId: null,
		isActive: true,
		isArchived: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		jobDateCreated: new Date(),
	};

	const mockScoringResult = {
		matchScore: 85,
		skillsEvidence: [{ required: 'React', employee: 'React', match: true }],
		riskFlags: [],
		budgetFit: 'good_fit' as const,
		recommendedAction: 'apply_now' as const,
		explanation: 'Strong React match.',
	};

	beforeEach(async () => {
		aiScoringService = {
			scoreMatch: jest.fn().mockResolvedValue(mockScoringResult),
		};

		employeeService = {
			getActiveWithJobSearchCriteria: jest.fn().mockResolvedValue([mockEmployee]),
		};

		configService = {
			aiMatchThreshold: jest.fn().mockReturnValue(60),
			aiScoringModel: jest.fn().mockReturnValue('openai/gpt-4o-mini'),
			novuMatchNotifyThreshold: jest.fn().mockReturnValue(80),
		};

		novuService = {
			sendMatchAlert: jest.fn().mockResolvedValue(undefined),
		};

		commandBus = {
			// the create command returns the matches it stored
			execute: jest.fn().mockImplementation(async (command: any) => command.employeeJobPosts),
		};

		repo = {
			find: jest.fn().mockResolvedValue([]),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				EmployeeJobPostService,
				{ provide: getRepositoryToken(EmployeeJobPost), useValue: repo },
				{ provide: CommandBus, useValue: commandBus },
				{ provide: EmployeeService, useValue: employeeService },
				{ provide: AiScoringService, useValue: aiScoringService },
				{ provide: ConfigurationService, useValue: configService },
				{ provide: NovuService, useValue: novuService },
				{ provide: 'pub_sub', useValue: { publish: jest.fn(), asyncIterator: jest.fn() } },
			],
		}).compile();

		service = module.get<EmployeeJobPostService>(EmployeeJobPostService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('match', () => {
		it('should match jobs to employees and create EmployeeJobPost records', async () => {
			await service.match([mockJobPost as any]);

			expect(employeeService.getActiveWithJobSearchCriteria).toHaveBeenCalled();
			expect(aiScoringService.scoreMatch).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'job-1' }),
				expect.objectContaining({ id: 'emp-1' })
			);
			expect(commandBus.execute).toHaveBeenCalled();
		});

		it('should skip matches below AI_MATCH_THRESHOLD', async () => {
			(aiScoringService.scoreMatch as jest.Mock).mockResolvedValueOnce({
				...mockScoringResult,
				matchScore: 30,
				recommendedAction: 'skip',
			});

			await service.match([mockJobPost as any]);

			expect(commandBus.execute).not.toHaveBeenCalled();
		});

		it('should save match without AI score when scoring fails', async () => {
			(aiScoringService.scoreMatch as jest.Mock).mockRejectedValueOnce(
				new Error('API unavailable')
			);

			await service.match([mockJobPost as any]);

			expect(commandBus.execute).toHaveBeenCalled();
		});

		it('should skip already existing employee-job connections', async () => {
			repo.find.mockResolvedValueOnce([{ id: 'ejp-1', jobPostId: 'job-1' }]);

			await service.match([mockJobPost as any]);

			expect(aiScoringService.scoreMatch).not.toHaveBeenCalled();
			expect(commandBus.execute).not.toHaveBeenCalled();
		});

		it('should send Novu notification for high-scoring matches', async () => {
			await service.match([mockJobPost as any]);

			expect(novuService.sendMatchAlert).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'emp-1' }),
				expect.objectContaining({ id: 'job-1' }),
				85,
				expect.any(String)
			);
		});

		it('should NOT send Novu notification for matches below notify threshold', async () => {
			(configService.novuMatchNotifyThreshold as jest.Mock).mockReturnValue(90);

			await service.match([mockJobPost as any]);

			expect(novuService.sendMatchAlert).not.toHaveBeenCalled();
		});

		it('should do nothing with empty jobs array', async () => {
			await service.match([]);

			expect(employeeService.getActiveWithJobSearchCriteria).not.toHaveBeenCalled();
		});

		it('should handle AI scoring failure gracefully without blocking other jobs', async () => {
			const jobs = [
				{ ...mockJobPost, id: 'job-fail' },
				{ ...mockJobPost, id: 'job-ok', providerJobId: '~ok' },
			];

			(aiScoringService.scoreMatch as jest.Mock)
				.mockRejectedValueOnce(new Error('Timeout'))
				.mockResolvedValueOnce(mockScoringResult);

			await service.match(jobs as any);

			expect(commandBus.execute).toHaveBeenCalled();
		});
	});
});
