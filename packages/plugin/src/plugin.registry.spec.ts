import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JOB_PROVIDERS_TOKEN } from '@packages/core-providers';
import { definePlugin, pluginEnabled, resolvePlugins } from './plugin.interface';
import { PluginRegistry } from './plugin-registry.service';
import { PluginsModule } from './plugin.registry';

class ProviderA {
	providerCode = 'a';
	providerName = 'A';
	async isEnabled() {
		return true;
	}
	async getJobs() {
		return [];
	}
}
class ProviderB extends ProviderA {
	providerCode = 'b';
}
@Module({ providers: [ProviderA], exports: [ProviderA] })
class ModuleA {}
@Module({ providers: [ProviderB], exports: [ProviderB] })
class ModuleB {}

const pluginA = definePlugin({ name: 'source-a', kind: 'job-source', description: 'A', env: ['A_URL'], imports: [ModuleA], jobProviders: [ProviderA], enabled: (env) => !!env.A_URL || 'A_URL is not set' });
const pluginB = definePlugin({ name: 'source-b', kind: 'job-source', description: 'B', imports: [ModuleB], jobProviders: [ProviderB] });
const pluginC = definePlugin({ name: 'cap-c', kind: 'ai', description: 'C' });

describe('plugins: resolution and loading', () => {
	it('resolves each plugin: environment override first, then the plugin rule, default on', () => {
		const resolved = resolvePlugins([pluginA, pluginB, pluginC], { GAUZY_AI_PLUGINS_DISABLED: 'cap-c, Source-B' });
		expect(resolved.map((r) => [r.plugin.name, r.enabled, r.reason])).toEqual([
			['source-a', false, 'A_URL is not set'],
			['source-b', false, 'disabled by GAUZY_AI_PLUGINS_DISABLED'],
			['cap-c', false, 'disabled by GAUZY_AI_PLUGINS_DISABLED'],
		]);
		expect(resolvePlugins([pluginA, pluginB, pluginC], { A_URL: 'http://a' }).every((r) => r.enabled)).toBe(true);
		expect(() => resolvePlugins([pluginB, pluginB], {})).toThrow(/listed twice/);
	});

	it('loads the modules of the enabled plugins and aggregates their job providers', async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [PluginsModule.forRoot([pluginA, pluginB, pluginC], { A_URL: 'http://a', GAUZY_AI_PLUGINS_DISABLED: 'source-b' })],
		}).compile();
		const providers = moduleRef.get<ProviderA[]>(JOB_PROVIDERS_TOKEN);
		expect(providers.map((p) => p.providerCode)).toEqual(['a']);
		const registry = moduleRef.get(PluginRegistry);
		expect(registry.list()).toEqual([
			{ name: 'source-a', kind: 'job-source', description: 'A', enabled: true, env: ['A_URL'], jobProviders: ['ProviderA'] },
			{ name: 'source-b', kind: 'job-source', description: 'B', enabled: false, reason: 'disabled by GAUZY_AI_PLUGINS_DISABLED', env: [], jobProviders: ['ProviderB'] },
			{ name: 'cap-c', kind: 'ai', description: 'C', enabled: true, env: [], jobProviders: [] },
		]);
		expect(registry.isEnabled('cap-c')).toBe(true);
		expect(registry.isEnabled('source-b')).toBe(false);
		expect(registry.enabled().map((p) => p.name)).toEqual(['source-a', 'cap-c']);
	});

	it('pluginEnabled: everything is on without a registry, otherwise the registry decides', () => {
		expect(pluginEnabled(undefined, 'novu')).toBe(true);
		expect(pluginEnabled({ isEnabled: (n) => n !== 'novu' }, 'novu')).toBe(false);
		expect(pluginEnabled({ isEnabled: (n) => n !== 'novu' }, 'langfuse')).toBe(true);
	});

	it('provides an empty provider list when no job-source plugin is enabled', async () => {
		const moduleRef = await Test.createTestingModule({ imports: [PluginsModule.forRoot([pluginC], {})] }).compile();
		expect(moduleRef.get(JOB_PROVIDERS_TOKEN)).toEqual([]);
	});
});
