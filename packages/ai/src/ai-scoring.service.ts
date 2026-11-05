import { Injectable, Logger, Optional, ServiceUnavailableException, Inject } from '@nestjs/common';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { ConfigurationService } from '@packages/config';
import { PROMPT_NAMES, PromptService, promptTelemetry } from '@packages/prompts';
import { AiScoringResult, AiScoringResultSchema } from './ai-scoring-result.interface';
import { Employee } from '@packages/entities/employee.entity';
import { JobPost } from '@packages/entities/jobPost.entity';

/**
 * AI Scoring Service
 *
 * Scores job-to-employee matches using the Vercel AI SDK with OpenRouter for multi-model access;
 * the system prompt comes from the prompt registry (`PromptService`: Langfuse, catalog fallback).
 */
@Injectable()
export class AiScoringService {
	private readonly logger = new Logger(AiScoringService.name);

	constructor(
		private readonly configurationService: ConfigurationService,
		private readonly prompts: PromptService,
		@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch
	) {}

	/**
	 * Score a job-employee match using AI.
	 *
	 * @param jobPost - The job post to score against
	 * @param employee - The employee to evaluate
	 * @returns Structured scoring result with match score, evidence, and recommendations
	 */
	public async scoreMatch(
		jobPost: JobPost,
		employee: Employee
	): Promise<AiScoringResult> {
		if (!pluginEnabled(this.plugins, CAPABILITY_PLUGINS.matchScoring)) {
			throw new ServiceUnavailableException('The match-scoring plugin is disabled (GAUZY_AI_PLUGINS_DISABLED)');
		}
		const apiKey = this.configurationService.openRouterApiKey();
		if (!apiKey) {
			throw new Error(
				'OPENROUTER_API_KEY is not configured. Cannot perform AI scoring.'
			);
		}

		const openrouter = createOpenRouter({ apiKey });
		const modelName =
			this.configurationService.aiScoringModel() || 'openai/gpt-4o-mini';

		// Build the scoring prompt
		const systemPrompt = await this.prompts.get(PROMPT_NAMES.jobMatchScoring);
		const userPrompt = this.buildUserPrompt(jobPost, employee);

		this.logger.debug(
			`Scoring match: Employee "${employee.firstName} ${employee.lastName}" vs Job "${jobPost.title}"`
		);

		try {
			const { object } = await generateObject({
				model: openrouter(modelName),
				schema: AiScoringResultSchema,
				system: systemPrompt.text,
				prompt: userPrompt,
				// AI SDK v7 telemetry has no free-form metadata; the ids are in the surrounding log lines.
				experimental_telemetry: promptTelemetry('job-match-scoring', systemPrompt),
			});

			this.logger.debug(
				`AI scoring complete: score=${object.matchScore}, action=${object.recommendedAction}`
			);

			return object;
		} catch (error) {
			this.logger.error(
				`AI scoring failed for Employee ${employee.id} / Job ${jobPost.id}: ${error.message}`
			);
			throw error;
		}
	}

	/**
	 * Build the user prompt from job post and employee data.
	 */
	private buildUserPrompt(jobPost: JobPost, employee: Employee): string {
		const employeeSkills =
			employee.skillsSummary ||
			employee.jobSearchCriteria
				?.filter((c) => c.isActive && !c.isArchived)
				?.map((c) => [c.keyword, c.occupation, c.category].filter(Boolean).join(', '))
				?.join('; ') ||
			'Not specified';

		const employeeBio = employee.bio || 'Not provided';
		const preferredRate = employee.preferredRate;
		const experienceSummary = employee.experienceSummary || 'Not provided';

		// Build compensation details string
		const compensationParts: string[] = [];
		if (jobPost.budget) compensationParts.push(`Budget: ${jobPost.budget}`);
		if (jobPost.compensationMin != null || jobPost.compensationMax != null) {
			const range = [jobPost.compensationMin, jobPost.compensationMax].filter(v => v != null).join('-');
			const suffix = jobPost.compensationInterval ? `/${jobPost.compensationInterval}` : '';
			const currency = jobPost.compensationCurrency || '';
			compensationParts.push(`Range: ${currency} ${range}${suffix}`.trim());
		}
		const compensationStr = compensationParts.length > 0
			? compensationParts.join(' | ')
			: 'Not specified';

		return `## Job Post

**Title:** ${jobPost.title || 'N/A'}
**Provider:** ${jobPost.providerCode || 'N/A'}
**Job Type:** ${jobPost.jobType || 'N/A'}
**Employment Type:** ${jobPost.employmentType || jobPost.jobType || 'N/A'}
**Status:** ${jobPost.jobStatus || 'N/A'}
**Seniority Level:** ${jobPost.jobLevel || 'Not specified'}
**Job Function:** ${jobPost.jobFunction || 'Not specified'}
**Category:** ${jobPost.searchCategory || 'N/A'}
**Skills Required:** ${jobPost.skills || 'Not specified'}
**Compensation:** ${compensationStr}
**Duration:** ${jobPost.duration || 'Not specified'}
**Location:** ${jobPost.location || 'Not specified'}
**Remote:** ${jobPost.isRemote != null ? (jobPost.isRemote ? 'Yes' : 'No') : 'Not specified'}
**Experience Required:** ${jobPost.experienceRange || 'Not specified'}
**Company:** ${jobPost.companyName || 'Not specified'}${jobPost.companyIndustry ? ` (${jobPost.companyIndustry})` : ''}${jobPost.companyNumEmployees ? ` — ${jobPost.companyNumEmployees} employees` : ''}${jobPost.companyRating ? ` — Rating: ${jobPost.companyRating}/5` : ''}
**Description:**
${jobPost.description || 'No description available'}

## Employee Profile

**Name:** ${employee.firstName || ''} ${employee.lastName || ''}
**Bio:** ${employeeBio}
**Skills:** ${employeeSkills}
**Experience:** ${experienceSummary}
**Preferred Rate:** ${preferredRate ? `$${preferredRate}/hr` : 'Not specified'}
**Job Type Preference:** ${employee.jobType || 'Any'}

Please evaluate this match and provide your structured assessment.`;
	}
}
