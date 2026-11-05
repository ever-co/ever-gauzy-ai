import type { DynamicModule, Type } from '@nestjs/common';
import type { IJobProvider } from '@packages/core-providers';

/** What a plugin contributes to the platform. */
export type PluginKind =
	/** A source of job posts (implements IJobProvider). */
	| 'job-source'
	/** An AI capability (scoring, proposals, screenshot analysis, …). */
	| 'ai'
	/** Notifications to people. */
	| 'notifications'
	/** Prompt registry / tracing. */
	| 'observability'
	/** Scheduling of the periodic jobs. */
	| 'scheduling'
	/** Anything else that integrates an external system. */
	| 'integration';

/**
 * A Gauzy AI plugin: a self-contained capability the platform loads at startup.
 *
 * A plugin bundles the NestJS modules that implement it, declares which environment variables it
 * reads and, for job sources, which `IJobProvider` classes its modules export (the crawler picks
 * them up through `JOB_PROVIDERS_TOKEN`). Plugins are listed in `src/plugins.ts`; any of them can
 * be switched off with `GAUZY_AI_PLUGINS_DISABLED=<name>,<name>` without a code change.
 */
export interface GauzyAiPlugin {
	/** Stable kebab-case identifier (`ever-jobs`, `upwork`, `screenshot-analysis`, …). */
	name: string;
	kind: PluginKind;
	description: string;
	/** Environment variables the plugin reads (documentation and `GET /api/plugins`). */
	env?: string[];
	/** NestJS modules to import when the plugin is enabled. */
	imports?: Array<Type<unknown> | DynamicModule>;
	/** `IJobProvider` classes exported by the plugin's modules; aggregated under `JOB_PROVIDERS_TOKEN`. */
	jobProviders?: Type<IJobProvider>[];
	/**
	 * Whether the plugin is on in this environment (default: on). Return a string to explain why it
	 * is off (shown by `GET /api/plugins`). `GAUZY_AI_PLUGINS_DISABLED` overrides this.
	 */
	enabled?: (env: NodeJS.ProcessEnv) => boolean | string;
}

/** Names of the built-in capability plugins, as checked by their implementations. */
export const CAPABILITY_PLUGINS = {
	matchScoring: 'match-scoring',
	proposalGeneration: 'proposal-generation',
	screenshotAnalysis: 'screenshot-analysis',
	langfuse: 'langfuse',
	novu: 'novu',
	triggerDev: 'trigger-dev',
} as const;

/** Something that answers "is plugin X on?" (the PluginRegistry); absent in unit tests = everything on. */
export interface PluginSwitch {
	isEnabled(name: string): boolean;
}

/** True unless a registry is present and reports the plugin as disabled. */
export function pluginEnabled(registry: PluginSwitch | undefined | null, name: string): boolean {
	return registry ? registry.isEnabled(name) : true;
}

/** Type-checked plugin definition. */
export function definePlugin(plugin: GauzyAiPlugin): GauzyAiPlugin {
	return plugin;
}

/** A plugin and the decision taken for it at startup. */
export interface ResolvedPlugin {
	plugin: GauzyAiPlugin;
	enabled: boolean;
	/** Why it is off (`GAUZY_AI_PLUGINS_DISABLED`, or the plugin's own reason). */
	reason?: string;
}

/** What `GET /api/plugins` reports. */
export interface PluginStatus {
	name: string;
	kind: PluginKind;
	description: string;
	enabled: boolean;
	reason?: string;
	env: string[];
	jobProviders: string[];
}

/** Injection token for the list of resolved plugins. */
export const PLUGINS_TOKEN = 'GAUZY_AI_PLUGINS';

/** Comma-separated plugin names switched off for this environment. */
export const PLUGINS_DISABLED_ENV = 'GAUZY_AI_PLUGINS_DISABLED';

/** Decides, per plugin, whether it is on: the environment override first, then the plugin's own rule. */
export function resolvePlugins(plugins: GauzyAiPlugin[], env: NodeJS.ProcessEnv = process.env): ResolvedPlugin[] {
	const disabled = new Set(
		(env[PLUGINS_DISABLED_ENV] ?? '')
			.split(',')
			.map((name) => name.trim().toLowerCase())
			.filter(Boolean)
	);
	const seen = new Set<string>();
	return plugins.map((plugin) => {
		if (seen.has(plugin.name)) {
			throw new Error(`Plugin "${plugin.name}" is listed twice`);
		}
		seen.add(plugin.name);
		if (disabled.has(plugin.name.toLowerCase())) {
			return { plugin, enabled: false, reason: `disabled by ${PLUGINS_DISABLED_ENV}` };
		}
		const verdict = plugin.enabled ? plugin.enabled(env) : true;
		if (verdict === true) {
			return { plugin, enabled: true };
		}
		return { plugin, enabled: false, reason: typeof verdict === 'string' ? verdict : 'disabled by the plugin' };
	});
}
