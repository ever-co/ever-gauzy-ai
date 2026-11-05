import { DynamicModule, Module, Global } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { EverJobsClientService } from './ever-jobs-client.service';
import { EverJobsClientOptions } from './interfaces';

const EVER_JOBS_CLIENT_OPTIONS = 'EVER_JOBS_CLIENT_OPTIONS';

/**
 * NestJS module for the Ever Jobs API client.
 *
 * Usage:
 * ```ts
 * EverJobsClientModule.register({
 *   apiUrl: 'http://localhost:3001',
 *   apiKey: 'optional-key',
 *   timeout: 30000,
 * })
 * ```
 *
 * Or use `registerAsync` for config-based initialization:
 * ```ts
 * EverJobsClientModule.registerAsync({
 *   inject: [ConfigurationService],
 *   useFactory: (config: ConfigurationService) => ({
 *     apiUrl: config.get('EVER_JOBS_API_URL'),
 *     apiKey: config.get('EVER_JOBS_API_KEY'),
 *     timeout: Number(config.get('EVER_JOBS_TIMEOUT')) || 30000,
 *   }),
 * })
 * ```
 */
@Global()
@Module({})
export class EverJobsClientModule {
	/**
	 * Register with static configuration.
	 */
	static register(options: EverJobsClientOptions): DynamicModule {
		return {
			module: EverJobsClientModule,
			imports: [HttpModule],
			providers: [
				{
					provide: EVER_JOBS_CLIENT_OPTIONS,
					useValue: options,
				},
				{
					provide: EverJobsClientService,
					useFactory: (httpService: any, opts: EverJobsClientOptions) =>
						new EverJobsClientService(httpService, opts),
					inject: [HttpService, EVER_JOBS_CLIENT_OPTIONS],
				},
			],
			exports: [EverJobsClientService],
		};
	}

	/**
	 * Register with async/factory configuration (e.g., from ConfigurationService).
	 */
	static registerAsync(asyncOptions: {
		inject?: any[];
		useFactory: (...args: any[]) => EverJobsClientOptions | Promise<EverJobsClientOptions>;
	}): DynamicModule {
		return {
			module: EverJobsClientModule,
			imports: [HttpModule],
			providers: [
				{
					provide: EVER_JOBS_CLIENT_OPTIONS,
					useFactory: asyncOptions.useFactory,
					inject: asyncOptions.inject ?? [],
				},
				{
					provide: EverJobsClientService,
					useFactory: (httpService: any, opts: EverJobsClientOptions) =>
						new EverJobsClientService(httpService, opts),
					inject: [HttpService, EVER_JOBS_CLIENT_OPTIONS],
				},
			],
			exports: [EverJobsClientService],
		};
	}
}
