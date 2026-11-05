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

import { CommandBus } from '@nestjs/cqrs';
import { EmployeeJobPostService } from './employeeJobPost.service';
import { AiScoringService } from '@packages/ai/ai-scoring.service';
import { ConfigurationService } from '@packages/config';
import { NovuService } from '@packages/novu';
import { EmployeeService } from '@packages/employee/employee.service';
import { EmployeeJobPost, JobPost } from '@packages/entities';

describe('EmployeeJobPostService – match()', () => {
	let service: EmployeeJobPostService;
	let mockRepo: any;
	let mockCommandBus: jest.Mocked<CommandBus>;
	let mockEmployeeService: any;
	let mockAiScoringService: any;
	let mockConfigService: any;
	let mockNovuService: any;

	beforeEach(() => {
		mockRepo = {
			find: jest.fn().mockResolvedValue([]), // no existing connections
			metadata: { columns: [], relations: [], connection: { options: { type: '' } }, target: EmployeeJobPost },
		};
		// the create command returns the matches it stored
		mockCommandBus = { execute: jest.fn().mockImplementation(async (command) => command.employeeJobPosts) } as any;
		mockEmployeeService = {
			getActiveWithJobSearchCriteria: jest.fn().mockResolvedValue([]),
		};
		mockAiScoringService = {
			scoreMatch: jest.fn().mockResolvedValue({
				matchScore: 85,
				skillsEvidence: 'Strong Node.js experience',
				riskFlags: [],
				budgetFit: 'within_range',
				recommendedAction: 'apply',
				explanation: 'Great fit for the role',
			}),
		};
		mockConfigService = {
			aiMatchThreshold: jest.fn().mockReturnValue(60),
			novuMatchNotifyThreshold: jest.fn().mockReturnValue(80),
			aiScoringModel: jest.fn().mockReturnValue('openai/gpt-4o-mini'),
		};
		mockNovuService = {
			sendMatchAlert: jest.fn().mockResolvedValue(undefined),
		};

		service = Object.create(EmployeeJobPostService.prototype);
		Object.assign(service, {
			repo: mockRepo,
			commandBus: mockCommandBus,
			employeeService: mockEmployeeService,
			aiScoringService: mockAiScoringService,
			configurationService: mockConfigService,
			novuService: mockNovuService,
			logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
			// instance fields (Object.create skips the constructor)
			matchingQueue: Promise.resolve(),
			rematchState: new Map(),
		});
	});

	const createEmployee = (overrides: any = {}) => ({
		id: 'emp-1',
		tenantId: 'tenant-1',
		orgId: 'org-1',
		firstName: 'Alice',
		lastName: 'Smith',
		userId: 'user-1',
		jobSearchCriteria: [{
			isActive: true,
			isArchived: false,
			category: 'Web',
			categoryId: 'cat-1',
			jobType: 'Hourly',
			keyword: 'node',
			occupation: 'Developer',
			occupationId: 'occ-1',
		}],
		...overrides,
	});

	const createJob = (overrides: any = {}) => ({
		id: 'job-1',
		isActive: true,
		isArchived: false,
		searchCategory: 'Web',
		searchCategoryId: 'cat-1',
		searchJobType: 'Hourly',
		searchKeyword: 'node',
		searchOccupation: 'Developer',
		searchOccupationId: 'occ-1',
		providerCode: 'upwork',
		providerJobId: 'prov-1',
		createdAt: new Date(),
		updatedAt: new Date(),
		jobStatus: 'Open',
		jobType: 'Hourly',
		jobDateCreated: new Date(),
		description: 'Build an API',
		title: 'API Developer',
		skills: 'Node.js',
		...overrides,
	} as unknown as JobPost);

	it('should create EmployeeJobPost records for matching criteria', async () => {
		const employee = createEmployee();
		const job = createJob();
		mockEmployeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee]);

		await service.match([job]);

		expect(mockCommandBus.execute).toHaveBeenCalled();
		expect(mockAiScoringService.scoreMatch).toHaveBeenCalledWith(job, employee);
	});

	it('should skip jobs below AI match threshold', async () => {
		const employee = createEmployee();
		const job = createJob();
		mockEmployeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee]);
		mockAiScoringService.scoreMatch.mockResolvedValue({
			matchScore: 30, // below threshold of 60
			explanation: 'Poor fit',
		});

		await service.match([job]);

		// commandBus should NOT be called because the match was below threshold
		expect(mockCommandBus.execute).not.toHaveBeenCalled();
	});

	it('should send Novu notification for high-scoring matches', async () => {
		const employee = createEmployee();
		const job = createJob();
		mockEmployeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee]);
		mockAiScoringService.scoreMatch.mockResolvedValue({
			matchScore: 90, // above notify threshold of 80
			explanation: 'Excellent fit',
			skillsEvidence: 'Strong',
			riskFlags: [],
			budgetFit: 'within_range',
			recommendedAction: 'apply',
		});

		await service.match([job]);

		expect(mockNovuService.sendMatchAlert).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'emp-1' }),
			expect.objectContaining({ id: 'job-1' }),
			90,
			'Excellent fit'
		);
	});

	it('should NOT send Novu notification for matches below notify threshold', async () => {
		const employee = createEmployee();
		const job = createJob();
		mockEmployeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee]);
		mockAiScoringService.scoreMatch.mockResolvedValue({
			matchScore: 70, // above match threshold (60) but below notify threshold (80)
			explanation: 'Decent fit',
			skillsEvidence: 'Good',
			riskFlags: [],
			budgetFit: 'within_range',
			recommendedAction: 'review',
		});

		await service.match([job]);

		expect(mockNovuService.sendMatchAlert).not.toHaveBeenCalled();
	});

	it('should handle AI scoring errors gracefully and still save the match', async () => {
		const employee = createEmployee();
		const job = createJob();
		mockEmployeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee]);
		mockAiScoringService.scoreMatch.mockRejectedValue(new Error('AI service down'));

		await service.match([job]);

		// Match should still be saved (without AI score) because the error is caught
		expect(mockCommandBus.execute).toHaveBeenCalled();
	});

	it('should skip already-connected employee-job pairs', async () => {
		const employee = createEmployee();
		const job = createJob();
		mockEmployeeService.getActiveWithJobSearchCriteria.mockResolvedValue([employee]);
		mockRepo.find.mockResolvedValue([{ id: 'ejp-1', jobPostId: 'job-1' }]); // already exists

		await service.match([job]);

		expect(mockAiScoringService.scoreMatch).not.toHaveBeenCalled();
	});

	it('should do nothing for empty jobs array', async () => {
		await service.match([]);

		expect(mockEmployeeService.getActiveWithJobSearchCriteria).not.toHaveBeenCalled();
	});
});
