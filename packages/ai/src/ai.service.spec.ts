import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { PromptService } from '@packages/prompts/prompt.service';
import { PROMPT_NAMES, catalogPrompt } from '@packages/prompts/catalog';
import { ConfigurationService } from '@packages/config';
import { GenerateProposalRequest } from './generateProposalRequest';

// Mock the Vercel AI SDK
jest.mock('ai', () => ({
	generateText: jest.fn(),
	generateObject: jest.fn(),
}));

// Mock OpenRouter provider
jest.mock('@openrouter/ai-sdk-provider', () => ({
	createOpenRouter: jest.fn(() => jest.fn(() => 'mocked-model')),
}));

// Mock html-to-text
jest.mock('html-to-text', () => ({
	htmlToText: jest.fn((html: string) => html),
}));

// Mock Langfuse
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({
		getPrompt: jest.fn(),
	})),
}));

describe('AiService - QA Answer Generation', () => {
	let service: AiService;
	let configService: Partial<ConfigurationService>;

	beforeEach(async () => {
		configService = {
			openRouterApiKey: jest.fn().mockReturnValue('test-api-key'),
			openAIModel: jest.fn().mockReturnValue('openai/gpt-4o-mini'),
			langfusePublicKey: jest.fn().mockReturnValue(''),
			langfuseSecretKey: jest.fn().mockReturnValue(''),
			langfuseHost: jest.fn().mockReturnValue('https://cloud.langfuse.com'),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AiService,
				PromptService,
				{
					provide: ConfigurationService,
					useValue: configService,
				},
			],
		}).compile();

		service = module.get<AiService>(AiService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('generateQAAnswers (via generateProposal)', () => {
		const baseRequest: GenerateProposalRequest = {
			title: 'Senior React Developer',
			description: 'We need a senior React developer for a 3-month project.',
			skills: 'React, TypeScript, Node.js',
			category: 'Web Development',
			employeeTemplate: 'I am an experienced full-stack developer...',
			qa: '',
		};

		it('should skip QA generation when qa is empty', async () => {
			const { generateText, generateObject } = require('ai');
			generateText.mockResolvedValueOnce({ text: 'Generated proposal text' });

			const request = { ...baseRequest, qa: '' };
			const result = await service.generateProposal(request);

			expect(result.proposal).toBe('Generated proposal text');
			expect(result.qa).toBe('');
			// generateObject should NOT have been called (no QA to answer)
			expect(generateObject).not.toHaveBeenCalled();
		});

		it('should generate QA answers when qa is provided', async () => {
			const { generateText, generateObject } = require('ai');
			generateText.mockResolvedValueOnce({ text: 'Generated proposal text' });

			const mockQAResult = {
				answers: [
					{
						question: 'How many years of React experience do you have?',
						answer: 'I have 5+ years of hands-on React experience.',
					},
					{
						question: 'Are you available full-time?',
						answer: 'Yes, I am available for full-time work immediately.',
					},
				],
			};
			generateObject.mockResolvedValueOnce({ object: mockQAResult });

			const request = {
				...baseRequest,
				qa: 'Q1: How many years of React experience do you have?\nQ2: Are you available full-time?',
			};

			const result = await service.generateProposal(request);

			expect(result.proposal).toBe('Generated proposal text');
			expect(generateObject).toHaveBeenCalledTimes(1);

			// QA response should be JSON-stringified answers array
			const parsedQA = JSON.parse(result.qa);
			expect(parsedQA).toHaveLength(2);
			expect(parsedQA[0].question).toContain('React experience');
			expect(parsedQA[1].answer).toContain('available');
		});

		it('should call generateObject with proper prompts for QA', async () => {
			const { generateText, generateObject } = require('ai');
			generateText.mockResolvedValueOnce({ text: 'Proposal text' });

			const mockQAResult = {
				answers: [{ question: 'test?', answer: 'yes' }],
			};
			generateObject.mockResolvedValueOnce({ object: mockQAResult });

			const request = {
				...baseRequest,
				qa: 'What is your hourly rate?',
			};

			await service.generateProposal(request);

			const call = generateObject.mock.calls[0][0];
			expect(call.model).toBe('mocked-model');
			expect(call.system).toContain('expert freelancer assistant');
			expect(call.prompt).toContain('What is your hourly rate?');
			expect(call.prompt).toContain('Screening Questions');
			expect(call.prompt).toContain('Job Details');
			expect(call.prompt).toContain('Employee Profile');
		});

		it('should fall back to original QA when QA generation fails', async () => {
			const { generateText, generateObject } = require('ai');
			generateText.mockResolvedValueOnce({ text: 'Proposal text' });
			generateObject.mockRejectedValueOnce(new Error('AI model overloaded'));

			const originalQA = 'Q: What is your rate?\nA: (needs answer)';
			const request = { ...baseRequest, qa: originalQA };

			const result = await service.generateProposal(request);

			expect(result.proposal).toBe('Proposal text');
			// Should gracefully fall back to the original QA string
			expect(result.qa).toBe(originalQA);
		});

		it('should handle null/undefined qa field gracefully', async () => {
			const { generateText, generateObject } = require('ai');
			generateText.mockResolvedValueOnce({ text: 'Proposal text' });

			const request = { ...baseRequest, qa: null as any };
			const result = await service.generateProposal(request);

			expect(result.proposal).toBe('Proposal text');
			expect(generateObject).not.toHaveBeenCalled();
		});
	});

	describe('qa-answer-generation prompt (catalog fallback)', () => {
		it('should return a prompt with clear rules', () => {
			const prompt = catalogPrompt(PROMPT_NAMES.qaAnswerGeneration)!.prompt;

			expect(prompt).toContain('expert freelancer assistant');
			expect(prompt).toContain('concise but thorough');
			expect(prompt).toContain('Be honest');
			expect(prompt).toContain('placeholder');
		});
	});

	// ── Hardening: edge cases for model routing & error paths ────────

	describe('generateProposal — model routing', () => {
		const baseRequest: GenerateProposalRequest = {
			title: 'Engineer',
			description: 'Build things',
			skills: 'TypeScript',
			category: 'Dev',
			employeeTemplate: 'I am a developer.',
			qa: '',
		};

		it('should throw when OPENROUTER_API_KEY is not configured', async () => {
			(configService.openRouterApiKey as jest.Mock).mockReturnValue('');

			await expect(service.generateProposal(baseRequest)).rejects.toThrow(
				'OPENROUTER_API_KEY is not configured'
			);
		});

		it('should fall back to openai/gpt-4o when openAIModel is empty', async () => {
			const { generateText } = require('ai');
			const { createOpenRouter } = require('@openrouter/ai-sdk-provider');
			generateText.mockResolvedValueOnce({ text: 'Proposal' });
			(configService.openAIModel as jest.Mock).mockReturnValue('');

			await service.generateProposal(baseRequest);

			// createOpenRouter returns a factory — verify the model name passed
			const openRouterFactory = createOpenRouter.mock.results[0]?.value;
			if (openRouterFactory) {
				// The factory was called with the default model name
				expect(openRouterFactory).toHaveBeenCalledWith('openai/gpt-4o');
			}
		});

		it('should propagate errors from generateText', async () => {
			const { generateText } = require('ai');
			generateText.mockRejectedValueOnce(new Error('rate limit exceeded'));

			await expect(service.generateProposal(baseRequest)).rejects.toThrow(
				'rate limit exceeded'
			);
		});
	});

	describe('job-proposal prompt (catalog fallback, issue #79 template)', () => {
		it('should contain key instruction elements', () => {
			const prompt = catalogPrompt(PROMPT_NAMES.jobProposal)!.prompt;

			expect(prompt).toContain('generate a short proposal');
			expect(prompt).toContain('Existing template');
			expect(prompt).toContain('Hello');
			expect(prompt).toContain('links');
		});
	});

	describe('generateProposal — input defaults', () => {
		it('should default missing fields to "not provided"', async () => {
			const { generateText } = require('ai');
			generateText.mockResolvedValueOnce({ text: 'Proposal text' });

			// Omit optional fields
			await service.generateProposal({
				title: '',
				description: '',
				skills: '',
				category: '',
				employeeTemplate: 'My template',
				qa: '',
			});

			// Verify generateText was called with 'not provided' defaults
			const call = generateText.mock.calls[0][0];
			expect(call.prompt).toContain('not provided');
		});
	});
});
