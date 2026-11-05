import { definePlugin, GauzyAiPlugin } from '@packages/plugin/plugin.interface';
import { EverJobsPlugin } from '@packages/provider-ever-jobs/ever-jobs.plugin';
import { SourceDbPlugin } from '@packages/provider-db/source-db.plugin';
import { UpworkPlugin } from '@packages/provider-upwork/upwork.plugin';

/**
 * The plugins of this deployment, loaded by `PluginsModule.forRoot` in AppModule.
 *
 * Job sources contribute `IJobProvider`s to the crawler; capability plugins describe the AI,
 * notification, prompt-registry and scheduling modules AppModule wires (they stay listed here so
 * `GET /api/plugins` shows the whole platform and so they can be switched off uniformly with
 * `GAUZY_AI_PLUGINS_DISABLED`). To add a plugin: implement its module (and `IJobProvider` for a
 * source), describe it with `definePlugin`, append it here — see docs/plugins.md.
 */
export const INSTALLED_PLUGINS: GauzyAiPlugin[] = [
	// ── job sources ────────────────────────────────────────────
	EverJobsPlugin,
	UpworkPlugin,
	SourceDbPlugin,
	// ── capabilities (modules wired by AppModule; listed for visibility and uniform switches) ──
	definePlugin({
		name: 'match-scoring',
		kind: 'ai',
		description: 'AI scoring of job ↔ employee matches (OpenRouter through the Vercel AI SDK; prompt job-match-scoring).',
		env: ['OPENROUTER_API_KEY', 'AI_SCORING_MODEL', 'AI_MATCH_THRESHOLD'],
		enabled: (env) => !!env.OPENROUTER_API_KEY || 'OPENROUTER_API_KEY is not set',
	}),
	definePlugin({
		name: 'proposal-generation',
		kind: 'ai',
		description: 'Proposal and screening-answer generation (prompts job-proposal, qa-answer-generation).',
		env: ['OPENROUTER_API_KEY', 'OPENAI_MODEL'],
		enabled: (env) => !!env.OPENROUTER_API_KEY || 'OPENROUTER_API_KEY is not set',
	}),
	definePlugin({
		name: 'screenshot-analysis',
		kind: 'ai',
		description: 'Work-relatedness analysis of screenshots (POST /api/image/process, /process-urls; OpenAI vision model). Credentials are resolved per request: the deployment key or the tenant\'s own OpenAI key.',
		env: ['OPENAI_API_KEY', 'OPENAI_API_KEY_CURRENT', 'OPENAI_VISION_PREVIEW_MODEL'],
		// always eligible: a tenant's TenantApiKey can supply the OpenAI credentials at request time
	}),
	definePlugin({
		name: 'langfuse',
		kind: 'observability',
		description: 'Prompt registry and generation traces in Langfuse (built-in catalog without keys).',
		env: ['LANGFUSE_HOST', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_TRACING_ENABLED'],
		enabled: (env) => (!!env.LANGFUSE_PUBLIC_KEY && !!env.LANGFUSE_SECRET_KEY) || 'LANGFUSE_* keys are not set (catalog mode)',
	}),
	definePlugin({
		name: 'novu',
		kind: 'notifications',
		description: 'Match, application and digest notifications through Novu.',
		env: ['NOVU_API_KEY', 'NOVU_MATCH_NOTIFY_THRESHOLD'],
		enabled: (env) => !!env.NOVU_API_KEY || 'NOVU_API_KEY is not set',
	}),
	definePlugin({
		name: 'trigger-dev',
		kind: 'scheduling',
		description: 'Periodic jobs on Trigger.dev workers instead of the in-process cron.',
		env: ['TRIGGER_DEV_ENABLED', 'TRIGGER_SECRET_KEY'],
		enabled: (env) => env.TRIGGER_DEV_ENABLED === 'true' || 'TRIGGER_DEV_ENABLED is not true (in-process cron runs the jobs)',
	}),
];
