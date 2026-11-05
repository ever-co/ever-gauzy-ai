import { registerAs } from '@nestjs/config';

/**
 * Configuration object for OpenAI settings.
 */
export interface OpenAIConfig {
	/** The OpenAI API Key to authenticate requests. */
	openAIApiKey: string;

	/** The OpenAI Organization ID for organization-specific settings. */
	openAIOrganizationId: string;

	/** The OpenAI Model to use for requests. */
	openAIModel: string;

	/** The model that allows processing images and answering questions about them. */
	openAIVisionPreviewModel: string;

	/** The URL for the Prompts API. */

	/** The API Key for the Prompts API. */

	/** The environment for the Prompts API (e.g., 'Production'). */

	/** OpenRouter API Key for multi-model access */
	openRouterApiKey: string;

	/** AI Scoring Model identifier (e.g. 'openai/gpt-4o-mini') */
	aiScoringModel: string;

	/** Minimum AI match score threshold (0-100) */
	aiMatchThreshold: number;

	/** Langfuse public key for prompt management */
	langfusePublicKey: string;

	/** Langfuse secret key for prompt management */
	langfuseSecretKey: string;

	/** Langfuse host URL */
	langfuseHost: string;

	/** Novu Cloud API key */
	novuApiKey: string;

	/** Novu match notification threshold */
	novuMatchNotifyThreshold: number;
}

/**
 * Creates a configuration object for OpenAI settings.
 *
 * @returns An object containing OpenAI configuration.
 */
export default registerAs('openAI', (): OpenAIConfig => ({
	/** The API key used to authenticate requests to the OpenAI API. */
	openAIApiKey: process.env.OPENAI_API_KEY_CURRENT || process.env.OPENAI_API_KEY,
	/** The Organization ID for organization-specific OpenAI settings. */
	openAIOrganizationId: process.env.OPENAI_ORGANIZATION_ID_CURRENT || process.env.OPENAI_ORGANIZATION_ID,
	/** The OpenAI model to be used for requests. */
	openAIModel: process.env.OPENAI_MODEL_CURRENT || process.env.OPENAI_MODEL,
	/** The model that allows processing images and answering questions about them. Defaults to 'gpt-4-vision-preview' if not provided. */
	openAIVisionPreviewModel: process.env.OPENAI_VISION_PREVIEW_MODEL || 'gpt-4-vision-preview',
	/** The URL for the Prompts API. */
	/** The API key for the Prompts API. */
	/** The environment for the Prompts API (e.g., 'Production'). Defaults to 'Production' if not provided. */

	/** OpenRouter API Key for multi-model access */
	openRouterApiKey: process.env.OPENROUTER_API_KEY,

	/** AI Scoring Model identifier */
	aiScoringModel: process.env.AI_SCORING_MODEL || 'openai/gpt-4o-mini',

	/** Minimum AI match score threshold */
	aiMatchThreshold: parseInt(process.env.AI_MATCH_THRESHOLD || '60', 10),

	/** Langfuse public key */
	langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,

	/** Langfuse secret key */
	langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,

	/** Langfuse host URL */
	langfuseHost: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',

	/** Novu Cloud API key */
	novuApiKey: process.env.NOVU_API_KEY,

	/** Novu match notification threshold */
	novuMatchNotifyThreshold: parseInt(process.env.NOVU_MATCH_NOTIFY_THRESHOLD || '80', 10),
}));
