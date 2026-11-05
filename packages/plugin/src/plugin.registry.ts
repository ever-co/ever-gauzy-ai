import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { IJobProvider, JOB_PROVIDERS_TOKEN } from '@packages/core-providers';
import { GauzyAiPlugin, PLUGINS_TOKEN, resolvePlugins } from './plugin.interface';
import { PluginRegistry } from './plugin-registry.service';
import { PluginsController } from './plugins.controller';

/**
 * Loads the plugins: imports the modules of the enabled ones and aggregates their job providers
 * under `JOB_PROVIDERS_TOKEN` for the crawler. Global, so any module can inject the token or the
 * registry.
 */
@Global()
@Module({})
export class PluginsModule {
	static forRoot(plugins: GauzyAiPlugin[], env: NodeJS.ProcessEnv = process.env): DynamicModule {
		const logger = new Logger(PluginsModule.name);
		const resolved = resolvePlugins(plugins, env);
		const enabled = resolved.filter((r) => r.enabled).map((r) => r.plugin);
		for (const r of resolved) {
			logger.log(`plugin ${r.plugin.name} (${r.plugin.kind}): ${r.enabled ? 'enabled' : `disabled — ${r.reason}`}`);
		}
		const providerClasses = enabled.flatMap((p) => p.jobProviders ?? []);
		return {
			module: PluginsModule,
			global: true,
			imports: enabled.flatMap((p) => p.imports ?? []),
			controllers: [PluginsController],
			providers: [
				{ provide: PLUGINS_TOKEN, useValue: resolved },
				PluginRegistry,
				{
					provide: JOB_PROVIDERS_TOKEN,
					useFactory: (...providers: IJobProvider[]) => providers,
					inject: providerClasses,
				},
			],
			exports: [PLUGINS_TOKEN, PluginRegistry, JOB_PROVIDERS_TOKEN],
		};
	}
}
