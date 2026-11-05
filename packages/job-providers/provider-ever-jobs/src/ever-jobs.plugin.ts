import { definePlugin } from '@packages/plugin/plugin.interface';
import { EverJobsClientModule } from '@packages/ever-jobs-client';
import { EverJobsModule } from './ever-jobs.module';
import { EverJobsProvider } from './ever-jobs.provider';

/**
 * Ever Jobs API as a job source: one provider that searches 25+ job sites (LinkedIn, Indeed,
 * Glassdoor, … and Upwork with the tenant's own API credentials) through the Ever Jobs service.
 * On when EVER_JOBS_API_URL is set.
 */
export const EverJobsPlugin = definePlugin({
	name: 'ever-jobs',
	kind: 'job-source',
	description: 'Job postings from 25+ job sites through the Ever Jobs API (per-employee search criteria; tenant Upwork credentials forwarded when configured).',
	env: ['EVER_JOBS_API_URL', 'EVER_JOBS_API_KEY', 'EVER_JOBS_TIMEOUT', 'EVER_JOBS_SITES', 'EVER_JOBS_RESULTS_WANTED'],
	enabled: (env) => !!env.EVER_JOBS_API_URL || 'EVER_JOBS_API_URL is not set',
	imports: [
		EverJobsClientModule.registerAsync({
			useFactory: () => ({
				apiUrl: process.env.EVER_JOBS_API_URL || 'http://localhost:3001',
				apiKey: process.env.EVER_JOBS_API_KEY || undefined,
				timeout: Number(process.env.EVER_JOBS_TIMEOUT) || 420_000,
			}),
		}),
		EverJobsModule.registerAsync({
			useFactory: () => ({
				sites: process.env.EVER_JOBS_SITES || undefined,
				resultsWanted: Number(process.env.EVER_JOBS_RESULTS_WANTED) || 50,
			}),
		}),
	],
	jobProviders: [EverJobsProvider],
});
