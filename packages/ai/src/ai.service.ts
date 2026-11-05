import { Injectable, Logger, Optional, ServiceUnavailableException, Inject } from '@nestjs/common';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { htmlToText } from 'html-to-text';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, generateObject } from 'ai';
import { GenerateProposalRequest } from './generateProposalRequest';
import { GenerateProposalResponse } from './generateProposalResponse';
import { AiQAResultSchema, AiQAResult } from './ai-qa-result.interface';
import { ConfigurationService } from '@packages/config';
import { PROMPT_NAMES, PromptService, promptTelemetry } from '@packages/prompts';

/**
 * AI service for proposal generation.
 *
 * Uses the Vercel AI SDK with OpenRouter for multi-model access; prompts come from the prompt
 * registry (`PromptService`: Langfuse, with the built-in catalog as fallback).
 */
// TODO: per-tenant prompt overrides (Langfuse labels per tenant) on top of the shared defaults
@Injectable()
export class AiService {
	private readonly logger = new Logger(AiService.name);

	constructor(
		private readonly configurationService: ConfigurationService,
		private readonly prompts: PromptService,
		@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch
	) {}

	async generateProposal(
		generateProposalRequest: GenerateProposalRequest
	): Promise<GenerateProposalResponse> {
		if (!pluginEnabled(this.plugins, CAPABILITY_PLUGINS.proposalGeneration)) {
			throw new ServiceUnavailableException('The proposal-generation plugin is disabled (GAUZY_AI_PLUGINS_DISABLED)');
		}
		const apiKey = this.configurationService.openRouterApiKey();
		if (!apiKey) {
			throw new Error(
				'OPENROUTER_API_KEY is not configured. Cannot generate proposals.'
			);
		}

		const openrouter = createOpenRouter({ apiKey });
		const modelName =
			this.configurationService.openAIModel() || 'openai/gpt-4o';

		// Build job details
		const skills = generateProposalRequest.skills || 'not provided';
		const title = generateProposalRequest.title || 'not provided';
		const description =
			generateProposalRequest.description || 'not provided';
		const category = generateProposalRequest.category || 'not provided';

		const jobDetailsInformation = `
			Job Title: ${title}

			Job Category: ${category}

			Job Skills: ${skills}

			Job Description:

			${description}
		`;

		const employeeTextInfo = htmlToText(
			generateProposalRequest.employeeTemplate,
			{ wordwrap: false }
		);

		const jobDetailsInfo = htmlToText(jobDetailsInformation, {
			wordwrap: false,
		});

		// The proposal prompt (issue #79's template) carries the instructions and both inputs as variables
		const proposalPrompt = await this.prompts.get(PROMPT_NAMES.jobProposal, {
			existingTemplate: employeeTextInfo,
			jobDetails: jobDetailsInfo,
		});

		this.logger.debug(`Generating proposal for job: ${title} (prompt from ${proposalPrompt.source})`);

		try {
			const { text } = await generateText({
				model: openrouter(modelName),
				prompt: proposalPrompt.text,
				experimental_telemetry: promptTelemetry('proposal-generation', proposalPrompt),
			});

			this.logger.debug(`AI Generated Proposal: ${text?.substring(0, 100)}...`);

			// Generate AI answers for screening questions if present
			let qaResponse = generateProposalRequest.qa;
			if (generateProposalRequest.qa) {
				try {
					const qaResult = await this.generateQAAnswers(
						generateProposalRequest.qa,
						jobDetailsInfo,
						employeeTextInfo,
						openrouter,
						modelName
					);
					qaResponse = JSON.stringify(qaResult.answers);
				} catch (qaError) {
					this.logger.warn(
						`QA answer generation failed: ${qaError.message}. Returning original QA.`
					);
				}
			}

			const generateProposalResponse: GenerateProposalResponse = {
				proposal: text,
				qa: qaResponse,
			};

			return generateProposalResponse;
		} catch (error) {
			this.logger.error(`Proposal generation failed: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Generate AI answers for screening questions.
	 *
	 * Uses Vercel AI SDK's `generateObject()` with a Zod schema for
	 * structured output. Each question gets a tailored answer based on
	 * the job context and employee profile.
	 */
	private async generateQAAnswers(
		qaString: string,
		jobDetails: string,
		employeeInfo: string,
		openrouter: ReturnType<typeof createOpenRouter>,
		modelName: string
	): Promise<AiQAResult> {
		const systemPrompt = await this.prompts.get(PROMPT_NAMES.qaAnswerGeneration);

		const userPrompt = `## Screening Questions

${qaString}

## Job Details

${jobDetails}

## Employee Profile

${employeeInfo}

Please answer each screening question based on the employee's profile and the job requirements.`;

		this.logger.debug('Generating QA answers for screening questions');

		const { object } = await generateObject({
			model: openrouter(modelName),
			schema: AiQAResultSchema,
			system: systemPrompt.text,
			prompt: userPrompt,
			experimental_telemetry: promptTelemetry('qa-answer-generation', systemPrompt),
		});

		this.logger.debug(
			`Generated ${object.answers.length} QA answer(s)`
		);

		return object;
	}

}
