import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { Langfuse } from 'langfuse';
import { ConfigurationService } from '@packages/config';
import { catalogPrompt, compileTemplate } from './catalog';

/** A prompt ready to send to a model. */
export interface ResolvedPrompt {
	name: string;
	/** The prompt with variables filled in. */
	text: string;
	/** Where it came from: the Langfuse registry or the built-in catalog. */
	source: 'langfuse' | 'catalog';
	/** Langfuse version, when it came from the registry. */
	version?: number;
	/**
	 * Langfuse prompt reference for AI SDK telemetry (`experimental_telemetry.metadata.langfusePrompt`),
	 * which links generations to the prompt version in Langfuse. Absent for catalog prompts.
	 */
	langfusePrompt?: string;
}

/**
 * The prompt registry client. Prompts live in Langfuse (`LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`,
 * `LANGFUSE_SECRET_KEY`), where they are versioned and edited without a deployment; the `production`
 * label is what runs. Without Langfuse credentials, or when a prompt is missing or Langfuse is
 * unreachable, the built-in catalog (`catalog.ts`, seeded into Langfuse with `yarn prompts:seed`)
 * is used, so the platform always works.
 */
@Injectable()
export class PromptService {
	private readonly logger = new Logger(PromptService.name);
	private readonly langfuse: Langfuse | null;

	constructor(
		private readonly configurationService: ConfigurationService,
		@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch
	) {
		const publicKey = configurationService.langfusePublicKey();
		const secretKey = configurationService.langfuseSecretKey();
		const baseUrl = configurationService.langfuseHost();
		if (publicKey && secretKey) {
			this.langfuse = new Langfuse({ publicKey, secretKey, baseUrl });
			this.logger.log(`Langfuse prompt registry: ${baseUrl ?? 'https://cloud.langfuse.com'}`);
		} else {
			this.langfuse = null;
			this.logger.warn('Langfuse credentials not configured: the built-in prompt catalog is used');
		}
	}

	/** False without keys or when the `langfuse` plugin is switched off (catalog mode). */
	public isLangfuseEnabled(): boolean {
		return this.langfuse !== null && pluginEnabled(this.plugins, CAPABILITY_PLUGINS.langfuse);
	}

	/** The prompt `name`, from Langfuse when possible, with `variables` filled in. */
	public async get(name: string, variables: Record<string, string | number | undefined> = {}): Promise<ResolvedPrompt> {
		if (this.isLangfuseEnabled()) {
			try {
				// the SDK caches prompts and refreshes them in the background; `production` label by default
				const prompt = await this.langfuse.getPrompt(name);
				const compiled = prompt.compile(variables as Record<string, string>);
				return {
					name,
					text: typeof compiled === 'string' ? compiled : JSON.stringify(compiled),
					source: 'langfuse',
					version: prompt.version,
					langfusePrompt: prompt.toJSON(), // already the serialized reference the exporter expects
				};
			} catch (error) {
				this.logger.warn(`Langfuse prompt "${name}" unavailable (${error.message}); using the built-in catalog`);
			}
		}
		const fallback = catalogPrompt(name);
		if (!fallback) {
			throw new Error(`Unknown prompt "${name}": not in Langfuse and not in the built-in catalog`);
		}
		return { name, text: compileTemplate(fallback.prompt, variables), source: 'catalog' };
	}

	/** Flushes pending Langfuse events (call on shutdown). */
	public async shutdown(): Promise<void> {
		await this.langfuse?.shutdownAsync();
	}
}
