import { Module, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EverJobsMapperService } from './ever-jobs-mapper.service';
import { EverJobsProvider, EverJobsProviderConfig } from './ever-jobs.provider';
import { EverJobsClientService } from '@packages/ever-jobs-client';
import { SourceConfigService } from '@packages/sourceConfig/sourceConfig.service';
import { SourceConfig } from '@packages/entities';

const EVER_JOBS_PROVIDER_CONFIG = 'EVER_JOBS_PROVIDER_CONFIG';

/**
 * NestJS module for the Ever Jobs source provider.
 *
 * Provides the EverJobsProvider (an IJobProvider implementation)
 * and the EverJobsMapperService. Uses SourceConfigService for
 * loading source credentials from the source_config table.
 *
 * Usage in CrawlerModule:
 * ```ts
 * // Static registration
 * EverJobsModule.register({ sites: 'linkedin,indeed', resultsWanted: 50 })
 *
 * // Async registration (with ConfigService)
 * EverJobsModule.registerAsync({
 *   inject: [ConfigService],
 *   useFactory: (cfg: ConfigService) => ({
 *     sites: cfg.get('EVER_JOBS_SITES'),
 *     resultsWanted: cfg.get('EVER_JOBS_RESULTS_WANTED', 50),
 *   }),
 * })
 * ```
 */
@Module({})
export class EverJobsModule {
	static register(config: EverJobsProviderConfig): DynamicModule {
		return {
			module: EverJobsModule,
			imports: [TypeOrmModule.forFeature([SourceConfig])],
			providers: [
				{
					provide: EVER_JOBS_PROVIDER_CONFIG,
					useValue: config,
				} as any,
				SourceConfigService,
				EverJobsMapperService,
				{
					provide: EverJobsProvider,
					useFactory: (
						client: EverJobsClientService,
						mapper: EverJobsMapperService,
						providerConfig: EverJobsProviderConfig,
						sourceConfigService: SourceConfigService,
					) => new EverJobsProvider(client, mapper, providerConfig, sourceConfigService),
					inject: [
						EverJobsClientService,
						EverJobsMapperService,
						EVER_JOBS_PROVIDER_CONFIG,
						SourceConfigService,
					],
				},
			],
			exports: [EverJobsProvider, EverJobsMapperService],
		};
	}

	static registerAsync(asyncOptions: {
		inject?: any[];
		useFactory: (...args: any[]) => EverJobsProviderConfig | Promise<EverJobsProviderConfig>;
	}): DynamicModule {
		return {
			module: EverJobsModule,
			imports: [TypeOrmModule.forFeature([SourceConfig])],
			providers: [
				{
					provide: EVER_JOBS_PROVIDER_CONFIG,
					useFactory: asyncOptions.useFactory,
					inject: asyncOptions.inject ?? [],
				},
				SourceConfigService,
				EverJobsMapperService,
				{
					provide: EverJobsProvider,
					useFactory: (
						client: EverJobsClientService,
						mapper: EverJobsMapperService,
						providerConfig: EverJobsProviderConfig,
						sourceConfigService: SourceConfigService,
					) => new EverJobsProvider(client, mapper, providerConfig, sourceConfigService),
					inject: [
						EverJobsClientService,
						EverJobsMapperService,
						EVER_JOBS_PROVIDER_CONFIG,
						SourceConfigService,
					],
				},
			],
			exports: [EverJobsProvider, EverJobsMapperService],
		};
	}
}

