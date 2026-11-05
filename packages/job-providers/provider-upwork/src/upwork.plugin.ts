import { definePlugin } from '@packages/plugin/plugin.interface';
import { UpworkModule } from './upwork.module';
import { UpworkProvider } from './upwork.provider';

/**
 * Upwork as a job source through its official API. Always loadable: whether searches run is
 * decided per tenant at crawl time by the presence of credentials (source config `upwork` or
 * the UPWORK_* variables). Reads only; never applies, messages or scrapes.
 */
export const UpworkPlugin = definePlugin({
	name: 'upwork',
	kind: 'job-source',
	description: 'Job postings from Upwork through its official API (OAuth2; per-tenant credentials in source configs, UPWORK_* as fallback). Read-only.',
	env: ['UPWORK_CLIENT_ID', 'UPWORK_CLIENT_SECRET', 'UPWORK_ACCESS_TOKEN', 'UPWORK_ORGANIZATION_ID', 'UPWORK_RESULTS_WANTED', 'UPWORK_TIMEOUT_MS', 'UPWORK_API_URL', 'UPWORK_TOKEN_URL'],
	imports: [UpworkModule.fromEnv()],
	jobProviders: [UpworkProvider],
});
