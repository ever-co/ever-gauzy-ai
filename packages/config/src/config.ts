import { Injectable } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';
import {
	JobSchedule,
	resolveSchedules,
	schedulerTimezone,
	scorePendingLimit,
	staleTaskTimeoutHours,
} from './schedules';

export default registerAs('config', () => ({
	env: process.env.NODE_ENV,
	dbType: process.env.DB_TYPE || 'postgres',
	isNotSLS: process.env.IS_NOT_SLS,
	state: process.env.STAGE,
	region: process.env.REGION,
	service: process.env.SERVICE,
}));

@Injectable()
export class ConfigurationService {

	constructor(
		private readonly configService: ConfigService
	) { }

	public isProduction(): boolean {
		return this.configService.get<string>('config.env') == 'production';
	}

	public dbType(): string | undefined {
		return this.configService.get<string>('config.dbType');
	}

	public isNotSLS(): boolean {
		return this.configService.get<boolean>('config.isNotSLS') == true;
	}

	/** OPENAI_API_KEY - OpenAI API Key (Example: sk-**********) */
	public openAIApiKey(): string | undefined {
		return this.configService.get<string>('openAI.openAIApiKey');
	}

	/** OPENAI_MODEL - OpenAI API is powered by a diverse set of models with different capabilities and price points. */
	public openAIModel(): string | undefined {
		return this.configService.get<string>('openAI.openAIModel');
	}

	/** OPENAI_VISION_PREVIEW_MODEL - The model that allows processing images and answering questions about them. */
	public openAIVisionPreviewModel(): string | undefined {
		return this.configService.get<string>('openAI.openAIVisionPreviewModel');
	}

	/** OPENAI_ORGANIZATION_ID - OpenAI Organization ID (Example: org-************) */
	public openAIOrganizationId(): string | undefined {
		return this.configService.get<string>('openAI.openAIOrganizationId');
	}

	/*
	|--------------------------------------------------------------------------
	| OpenRouter + Langfuse + AI Scoring Config
	|--------------------------------------------------------------------------
	*/

	/** OPENROUTER_API_KEY — API key for OpenRouter (multi-model gateway) */
	public openRouterApiKey(): string | undefined {
		return this.configService.get<string>('openAI.openRouterApiKey');
	}

	/** AI_SCORING_MODEL — Model identifier for AI scoring (e.g. 'openai/gpt-4o-mini') */
	public aiScoringModel(): string | undefined {
		return this.configService.get<string>('openAI.aiScoringModel');
	}

	/** AI_MATCH_THRESHOLD — Minimum AI match score to keep a match (0-100, default 60) */
	public aiMatchThreshold(): number {
		return this.configService.get<number>('openAI.aiMatchThreshold') ?? 60;
	}

	/** LANGFUSE_PUBLIC_KEY — Langfuse project public key */
	public langfusePublicKey(): string | undefined {
		return this.configService.get<string>('openAI.langfusePublicKey');
	}

	/** LANGFUSE_SECRET_KEY — Langfuse project secret key */
	public langfuseSecretKey(): string | undefined {
		return this.configService.get<string>('openAI.langfuseSecretKey');
	}

	/** LANGFUSE_HOST — Langfuse host URL (default: https://cloud.langfuse.com) */
	public langfuseHost(): string | undefined {
		return this.configService.get<string>('openAI.langfuseHost');
	}

	/** NOVU_API_KEY — Novu Cloud API key for notifications */
	public novuApiKey(): string | undefined {
		return this.configService.get<string>('openAI.novuApiKey');
	}

	/** NOVU_MATCH_NOTIFY_THRESHOLD — Minimum match score to trigger notification (default 80) */
	public novuMatchNotifyThreshold(): number {
		return this.configService.get<number>('openAI.novuMatchNotifyThreshold') ?? 80;
	}

	/*
	|--------------------------------------------------------------------------
	| Source-DB Config
	|--------------------------------------------------------------------------
	*/

	/** SOURCE_DB_ENABLED — Whether to enable the local DB as a job source (default: false) */
	public sourceDbEnabled(): boolean {
		return this.configService.get<string>('SOURCE_DB_ENABLED') === 'true';
	}

	/** SOURCE_DB_MAX_AGE_HOURS — Maximum age of cached jobs to consider (default: 72) */
	public sourceDbMaxAgeHours(): number {
		return this.configService.get<number>('SOURCE_DB_MAX_AGE_HOURS') ?? 72;
	}

	/*
	|--------------------------------------------------------------------------
	| Trigger.dev Config
	|--------------------------------------------------------------------------
	*/

	/** TRIGGER_DEV_ENABLED — Whether to use Trigger.dev for production scheduling (default: false) */
	public triggerDevEnabled(): boolean {
		return process.env.TRIGGER_DEV_ENABLED === 'true';
	}

	/** TRIGGER_SECRET_KEY — Trigger.dev project secret key */
	public triggerSecretKey(): string | undefined {
		return process.env.TRIGGER_SECRET_KEY;
	}

	/** Token schedulers present as `X-SERVICE-TOKEN` to `/api/ops/*` and `/api/crawler/*`. */
	public serviceApiToken(): string | undefined {
		return process.env.SERVICE_API_TOKEN;
	}

	/**
	 * In-process cron (SchedulerService): on unless `LOCAL_CRON_ENABLED=false`; when the variable is
	 * not set it is on exactly when Trigger.dev is disabled, so the jobs run once, not twice.
	 */
	public localCronEnabled(): boolean {
		const explicit = process.env.LOCAL_CRON_ENABLED;
		if (explicit === 'true' || explicit === 'false') return explicit === 'true';
		return !this.triggerDevEnabled();
	}

	/*
	|--------------------------------------------------------------------------
	| Periodic jobs (see schedules.ts: shared with the Trigger.dev tasks)
	|--------------------------------------------------------------------------
	*/

	/** The periodic jobs with their effective cron expressions (`*_CRON`, else the `*_INTERVAL_MINUTES`, else the defaults). */
	public schedules(): JobSchedule[] {
		return resolveSchedules(process.env);
	}

	/** IANA time zone for the cron expressions (SCHEDULER_TIMEZONE; unset = the scheduler's own default). */
	public schedulerTimezone(): string | undefined {
		return schedulerTimezone(process.env);
	}

	/** Matches scored per pending-match scoring run (SCORE_PENDING_LIMIT, default 50). */
	/**
	 * Keywords the crawler searches when no employee has search criteria yet
	 * (CRAWL_DEFAULT_KEYWORDS, comma-separated; issue #3). Empty = skip the crawl, as before.
	 */
	public crawlDefaultKeywords(): string[] {
		return (process.env.CRAWL_DEFAULT_KEYWORDS ?? '')
			.split(',')
			.map((k) => k.trim())
			.filter(Boolean);
	}

	public scorePendingLimit(): number {
		return scorePendingLimit(process.env);
	}

	/** Hours a pending automation task may stay open before the cleanup times it out (STALE_TASK_TIMEOUT_HOURS, default 24). */
	public staleTaskTimeoutHours(): number {
		return staleTaskTimeoutHours(process.env);
	}









}
