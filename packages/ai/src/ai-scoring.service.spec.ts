import { Test, TestingModule } from '@nestjs/testing';
import { AiScoringService } from './ai-scoring.service';
import { PromptService } from '@packages/prompts/prompt.service';
import { ConfigurationService } from '@packages/config';
import { Employee } from '@packages/entities/employee.entity';
import { JobPost } from '@packages/entities/jobPost.entity';

// Mock the Vercel AI SDK
jest.mock('ai', () => ({
	generateObject: jest.fn(),
}));

// Mock OpenRouter provider
jest.mock('@openrouter/ai-sdk-provider', () => ({
	createOpenRouter: jest.fn(() => jest.fn(() => 'mocked-model')),
}));

// Mock Langfuse
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({
		getPrompt: jest.fn(),
	})),
}));

describe('AiScoringService', () => {
	let service: AiScoringService;
	let configService: Partial<ConfigurationService>;

	const mockEmployee: Partial<Employee> = {
		id: 'emp-1',
		firstName: 'John',
		lastName: 'Doe',
		bio: 'Full-stack developer with 5 years experience',
		skillsSummary: 'React, TypeScript, Node.js, AWS',
		preferredRate: 75,
		experienceSummary: '5 years at tech startups building web apps',
		jobType: 'Hourly',
		jobSearchCriteria: [],
	};

	const mockJobPost: Partial<JobPost> = {
		id: 'job-1',
		title: 'Senior React Developer',
		description: 'We need a senior React developer for a 3-month project.',
		providerCode: 'upwork',
		providerJobId: '~abc123',
		budget: '$50-$80/hr',
		duration: '3 months',
		jobType: 'Hourly',
		jobStatus: 'Open',
		searchCategory: 'Web Development',
		skills: 'React, TypeScript, Node.js',
	};

	const mockScoringResult = {
		matchScore: 85,
		skillsEvidence: [
			{ required: 'React', employee: 'React', match: true },
			{ required: 'TypeScript', employee: 'TypeScript', match: true },
			{ required: 'Node.js', employee: 'Node.js', match: true },
		],
		riskFlags: [],
		budgetFit: 'good_fit' as const,
		recommendedAction: 'apply_now' as const,
		explanation: 'Strong skills match with appropriate rate.',
	};

	beforeEach(async () => {
		configService = {
			openRouterApiKey: jest.fn().mockReturnValue('test-api-key'),
			aiScoringModel: jest.fn().mockReturnValue('openai/gpt-4o-mini'),
			langfusePublicKey: jest.fn().mockReturnValue(''),
			langfuseSecretKey: jest.fn().mockReturnValue(''),
			langfuseHost: jest.fn().mockReturnValue('https://cloud.langfuse.com'),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AiScoringService,
				PromptService,
				{
					provide: ConfigurationService,
					useValue: configService,
				},
			],
		}).compile();

		service = module.get<AiScoringService>(AiScoringService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('scoreMatch', () => {
		it('should return structured scoring result on success', async () => {
			const { generateObject } = require('ai');
			generateObject.mockResolvedValueOnce({ object: mockScoringResult });

			const result = await service.scoreMatch(
				mockJobPost as JobPost,
				mockEmployee as Employee
			);

			expect(result).toBeDefined();
			expect(result.matchScore).toBe(85);
			expect(result.recommendedAction).toBe('apply_now');
			expect(result.budgetFit).toBe('good_fit');
			expect(result.skillsEvidence).toHaveLength(3);
			expect(result.riskFlags).toHaveLength(0);
			expect(result.explanation).toBeTruthy();
		});

		it('should throw error when OPENROUTER_API_KEY is not configured', async () => {
			(configService.openRouterApiKey as jest.Mock).mockReturnValue('');

			await expect(
				service.scoreMatch(mockJobPost as JobPost, mockEmployee as Employee)
			).rejects.toThrow('OPENROUTER_API_KEY is not configured');
		});

		it('should throw error when AI scoring fails', async () => {
			const { generateObject } = require('ai');
			generateObject.mockRejectedValueOnce(new Error('API rate limit exceeded'));

			await expect(
				service.scoreMatch(mockJobPost as JobPost, mockEmployee as Employee)
			).rejects.toThrow('API rate limit exceeded');
		});

		it('should call generateObject with correct model and schema', async () => {
			const { generateObject } = require('ai');
			generateObject.mockResolvedValueOnce({ object: mockScoringResult });

			await service.scoreMatch(
				mockJobPost as JobPost,
				mockEmployee as Employee
			);

			expect(generateObject).toHaveBeenCalledTimes(1);
			expect(generateObject).toHaveBeenCalledWith(
				expect.objectContaining({
					model: 'mocked-model',
					system: expect.stringContaining('expert recruiter'),
					prompt: expect.stringContaining('Senior React Developer'),
				})
			);
		});

		it('should build user prompt with employee enrichment fields', async () => {
			const { generateObject } = require('ai');
			generateObject.mockResolvedValueOnce({ object: mockScoringResult });

			await service.scoreMatch(
				mockJobPost as JobPost,
				mockEmployee as Employee
			);

			const call = generateObject.mock.calls[0][0];
			expect(call.prompt).toContain('Full-stack developer');
			expect(call.prompt).toContain('React, TypeScript, Node.js, AWS');
			expect(call.prompt).toContain('$75/hr');
			expect(call.prompt).toContain('5 years at tech startups');
		});

		it('should handle employee with no enrichment fields gracefully', async () => {
			const { generateObject } = require('ai');
			generateObject.mockResolvedValueOnce({ object: mockScoringResult });

			const bareEmployee: Partial<Employee> = {
				id: 'emp-2',
				firstName: 'Jane',
				lastName: 'Smith',
				jobSearchCriteria: [],
			};

			const result = await service.scoreMatch(
				mockJobPost as JobPost,
				bareEmployee as Employee
			);

			expect(result).toBeDefined();
			const call = generateObject.mock.calls[0][0];
			expect(call.prompt).toContain('Not provided');
			expect(call.prompt).toContain('Not specified');
		});
	});
});
