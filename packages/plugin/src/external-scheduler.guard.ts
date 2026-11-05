import { CanActivate, ConflictException, ExecutionContext, Injectable, Optional, Inject } from '@nestjs/common';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from './plugin.interface';
import { PluginRegistry } from './plugin-registry.service';

/** Header a Trigger.dev task sends with its callbacks (see src/trigger/api-client.ts). */
export const SCHEDULER_HEADER = 'x-scheduler';
export const TRIGGER_DEV_SCHEDULER = 'trigger-dev';

/**
 * A deployment that switched the `trigger-dev` plugin off runs the periodic jobs itself; callbacks
 * from Trigger.dev workers whose schedules are still deployed are refused (409) so the same job
 * does not run twice (duplicate digests, double crawls).
 */
@Injectable()
export class ExternalSchedulerGuard implements CanActivate {
	constructor(@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
		const scheduler = request?.headers?.[SCHEDULER_HEADER];
		const value = Array.isArray(scheduler) ? scheduler[0] : scheduler;
		if (value?.toLowerCase() === TRIGGER_DEV_SCHEDULER && !pluginEnabled(this.plugins, CAPABILITY_PLUGINS.triggerDev)) {
			throw new ConflictException('Trigger.dev scheduling is disabled on this deployment (plugin trigger-dev off): the in-process scheduler runs the jobs');
		}
		return true;
	}
}
