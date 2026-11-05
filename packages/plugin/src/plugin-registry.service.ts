import { Inject, Injectable } from '@nestjs/common';
import { GauzyAiPlugin, PluginStatus, PLUGINS_TOKEN, ResolvedPlugin } from './plugin.interface';

/** Read access to the plugins loaded at startup. */
@Injectable()
export class PluginRegistry {
	constructor(@Inject(PLUGINS_TOKEN) private readonly resolved: ResolvedPlugin[]) {}

	public list(): PluginStatus[] {
		return this.resolved.map(({ plugin, enabled, reason }) => ({
			name: plugin.name,
			kind: plugin.kind,
			description: plugin.description,
			enabled,
			...(reason ? { reason } : {}),
			env: plugin.env ?? [],
			jobProviders: (plugin.jobProviders ?? []).map((p) => p.name),
		}));
	}

	public enabled(): GauzyAiPlugin[] {
		return this.resolved.filter((r) => r.enabled).map((r) => r.plugin);
	}

	public isEnabled(name: string): boolean {
		return this.resolved.some((r) => r.plugin.name === name && r.enabled);
	}
}
