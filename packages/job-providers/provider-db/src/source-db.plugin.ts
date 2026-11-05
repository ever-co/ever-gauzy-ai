import { definePlugin } from '@packages/plugin/plugin.interface';
import { SourceDbModule } from './source-db.module';
import { SourceDbProvider } from './source-db.provider';

/**
 * Recently stored job posts as a job source ("blending"): re-matches posts crawled earlier against
 * new or changed employee criteria. On when SOURCE_DB_ENABLED=true.
 */
export const SourceDbPlugin = definePlugin({
	name: 'source-db',
	kind: 'job-source',
	description: 'Re-matches job posts already stored (younger than SOURCE_DB_MAX_AGE_HOURS) against the current search criteria.',
	env: ['SOURCE_DB_ENABLED', 'SOURCE_DB_MAX_AGE_HOURS'],
	enabled: (env) => env.SOURCE_DB_ENABLED === 'true' || 'SOURCE_DB_ENABLED is not true',
	imports: [
		SourceDbModule.registerAsync({
			useFactory: () => ({
				enabled: process.env.SOURCE_DB_ENABLED === 'true',
				maxAgeHours: Number(process.env.SOURCE_DB_MAX_AGE_HOURS) || 72,
			}),
		}),
	],
	jobProviders: [SourceDbProvider],
});
