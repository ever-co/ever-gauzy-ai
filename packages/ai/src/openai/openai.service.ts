import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigurationService } from '@packages/config/config';

/** Credentials for one request (a tenant's own OpenAI account). */
export interface OpenAICredentials {
	apiKey?: string;
	organization?: string;
}

/**
 * OpenAI service — updated for openai SDK v4+
 */
@Injectable()
export class OpenAIService {

	private logging: boolean = true;
	private openai?: OpenAI;
	private clientApiKey: string;
	private clientOrganization: string;
	private openaiModel: string;
	private openAIApiKey: string;
	private openAIOrganizationId: string;

	constructor(
		private readonly configurationService: ConfigurationService,
	) {
		this.openaiModel = this.configurationService.openAIModel();
		this.openAIApiKey = this.configurationService.openAIApiKey();
		this.openAIOrganizationId = this.configurationService.openAIOrganizationId();

		if (this.logging) {
			// Never print the key itself, only whether one is configured.
			console.log('Open AI API Key: %s', this.openAIApiKey ? 'set' : 'not set');
			console.log('Open AI Organization ID: %s', this.openAIOrganizationId);
		}

		this.setOpenAIKeys(this.openAIApiKey, this.openAIOrganizationId);
	}

	/**
	 * Set OpenAI API keys for a specific organization.
	 * @param apiKey - The API key to set.
	 * @param organization - The organization ID for which the API key is set.
	 */
	public setOpenAIKeys(apiKey: string, organization: string): void {
		if (!apiKey) {
			apiKey = this.openAIApiKey;
		}
		if (!organization) {
			organization = this.openAIOrganizationId;
		}

		// Keep the keys and create the client on first use (see `client()`). `new OpenAI()` throws
		// when no key is set, and creating it here made every boot need OPENAI_API_KEY, including
		// `yarn build`, which boots Nest to generate the GraphQL schema and SDK. A missing key now
		// fails the first OpenAI call (logged by the caller's catch) instead of the whole app.
		this.clientApiKey = apiKey;
		this.clientOrganization = organization;
		this.openai = undefined;
	}

	/**
	 * A client for request-scoped credentials, or the shared one. Built per call (the SDK client is
	 * cheap) so that one tenant's credentials can never leak into another tenant's request through
	 * shared mutable state.
	 */
	private clientFor(credentials?: OpenAICredentials): OpenAI {
		if (credentials?.apiKey) {
			return new OpenAI({ apiKey: credentials.apiKey, organization: credentials.organization || undefined });
		}
		return this.client();
	}

	/**
	 * The OpenAI client for the current keys, created on first use.
	 */
	private client(): OpenAI {
		if (!this.openai) {
			this.openai = new OpenAI({
				apiKey: this.clientApiKey,
				organization: this.clientOrganization,
			});
		}
		return this.openai;
	}

	/**
	 * Creates a completion for the chat message
	 *
	 * @param prompt - The initial message or prompt for the chat
	 * @param options - Additional options for the chat completion (model, max_tokens, temperature, n)
	 * @param role - The role of the message (User or System)
	 * @param messages - Additional messages to be included in the conversation
	 * @returns A Promise resolving to the generated chat completion
	 */
	public async createChatCompletion(
		prompt: string,
		options: any = {},
		role: 'user' | 'system' | 'assistant' = 'user',
		messages: any[] = [],
		/** Request-scoped credentials (a tenant's own OpenAI key); the shared client is used without. */
		credentials?: OpenAICredentials
	): Promise<string> {
		try {
			const completionRequest = {
				model: options.model || this.openaiModel,
				messages: [
					{
						role: role,
						content: prompt,
					},
					...messages
				],
				max_tokens: options.max_tokens || 1000,
				temperature: options.temperature || 0.2,
				n: options.n || 1,
			};

			console.log(`Completion Request: ${JSON.stringify(completionRequest)}`);

			const completion = await this.clientFor(credentials).chat.completions.create(completionRequest);

			console.log(`Completion Response: ${JSON.stringify(completion)}`);

			return completion?.choices[0]?.message?.content;
		} catch (error) {
			console.log('Error creating chat completion: %s', error?.message);
		}
	}
}
