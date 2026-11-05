import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SOURCE_DB_CONFIG, SourceDbProvider, SourceDbProviderConfig } from './source-db.provider';
import { JobPost } from '@packages/entities';

@Module({})
export class SourceDbModule {
	/**
	 * Register the source-db provider with async configuration.
	 *
	 * Usage:
	 * ```typescript
	 * SourceDbModule.registerAsync({
	 *   inject: [ConfigService],
	 *   useFactory: (cfg: ConfigService) => ({
	 *     enabled: cfg.get('SOURCE_DB_ENABLED') === 'true',
	 *     maxAgeHours: cfg.get('SOURCE_DB_MAX_AGE_HOURS', 72),
	 *   }),
	 * })
	 * ```
	 */
	static registerAsync(options: {
		inject?: any[];
		useFactory: (...args: any[]) => SourceDbProviderConfig | Promise<SourceDbProviderConfig>;
	}): DynamicModule {
		return {
			module: SourceDbModule,
			imports: [TypeOrmModule.forFeature([JobPost])],
			providers: [
				{
					provide: SOURCE_DB_CONFIG,
					inject: options.inject || [],
					useFactory: options.useFactory,
				},
				SourceDbProvider,
			],
			exports: [SourceDbProvider],
		};
	}
}
