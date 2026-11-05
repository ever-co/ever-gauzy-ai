import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceConfig } from '@packages/entities';
import { SourceConfigService } from '@packages/sourceConfig/sourceConfig.service';
import { UPWORK_PROVIDER_CONFIG, UpworkProvider, UpworkProviderConfig } from './upwork.provider';

/** The Upwork job source (official API). Register with the global settings; credentials come from source configs / UPWORK_* variables. */
@Module({})
export class UpworkModule {
	static register(config: UpworkProviderConfig): DynamicModule {
		return {
			module: UpworkModule,
			imports: [TypeOrmModule.forFeature([SourceConfig])],
			providers: [
				{ provide: UPWORK_PROVIDER_CONFIG, useValue: config },
				SourceConfigService,
				{
					provide: UpworkProvider,
					useFactory: (providerConfig: UpworkProviderConfig, sourceConfigService: SourceConfigService) =>
						new UpworkProvider(providerConfig, sourceConfigService),
					inject: [UPWORK_PROVIDER_CONFIG, SourceConfigService],
				},
			],
			exports: [UpworkProvider],
		};
	}

	/** Settings from the environment (UPWORK_* variables). */
	static fromEnv(env: NodeJS.ProcessEnv = process.env): DynamicModule {
		return UpworkModule.register({
			apiUrl: env.UPWORK_API_URL || undefined,
			tokenUrl: env.UPWORK_TOKEN_URL || undefined,
			resultsWanted: Number(env.UPWORK_RESULTS_WANTED) || undefined,
			timeoutMs: Number(env.UPWORK_TIMEOUT_MS) || undefined,
			clientId: env.UPWORK_CLIENT_ID || undefined,
			clientSecret: env.UPWORK_CLIENT_SECRET || undefined,
			accessToken: env.UPWORK_ACCESS_TOKEN || undefined,
			organizationId: env.UPWORK_ORGANIZATION_ID || undefined,
		});
	}
}
