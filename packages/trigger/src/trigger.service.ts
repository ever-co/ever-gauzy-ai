import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { configure, tasks } from '@trigger.dev/sdk/v3';
import { ConfigurationService } from '@packages/config';

/**
 * Trigger.dev client. The scheduled and event tasks live in `src/trigger/*.ts` and run on
 * Trigger.dev workers (`yarn trigger:dev` / `yarn trigger:deploy`), calling back into this API
 * (`/api/ops/*`, `/api/crawler/*`) with the service token. This service only configures the SDK so
 * the API can enqueue event tasks; when Trigger.dev is disabled the in-process SchedulerService
 * (packages/ops) runs the same jobs with node-cron.
 */
@Injectable()
export class TriggerService implements OnModuleInit {
	private readonly logger = new Logger(TriggerService.name);
	private enabled = false;

	constructor(
		private readonly configService: ConfigurationService,
		@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch
	) {}

	onModuleInit(): void {
		if (!pluginEnabled(this.plugins, CAPABILITY_PLUGINS.triggerDev)) {
			this.logger.log('Trigger.dev plugin disabled (GAUZY_AI_PLUGINS_DISABLED): the in-process scheduler runs the periodic jobs.');
			return;
		}
		if (!this.configService.triggerDevEnabled()) {
			this.logger.log('Trigger.dev disabled (TRIGGER_DEV_ENABLED != true): the in-process scheduler runs the periodic jobs.');
			return;
		}
		const secretKey = this.configService.triggerSecretKey();
		if (!secretKey) {
			this.logger.warn('TRIGGER_DEV_ENABLED is true but TRIGGER_SECRET_KEY is not set: event tasks cannot be triggered from the API.');
			return;
		}
		configure({ secretKey });
		this.enabled = true;
		this.logger.log('Trigger.dev SDK configured: scheduled tasks run on Trigger.dev workers (src/trigger), event tasks can be triggered from the API.');
	}

	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Enqueues an event task defined in src/trigger (e.g. `score-matches`).
	 * @param options.delay - start the run later (e.g. `'5m'` or a Date) instead of right away
	 * @returns the Trigger.dev run id, or null when Trigger.dev is disabled.
	 */
	public async trigger(taskId: string, payload: Record<string, unknown>, options: { delay?: string | Date } = {}): Promise<string | null> {
		if (!this.enabled) {
			return null;
		}
		const handle = await tasks.trigger(taskId, payload, options.delay ? { delay: options.delay } : undefined);
		this.logger.log(`Triggered ${taskId}: run ${handle.id}`);
		return handle.id;
	}
}
