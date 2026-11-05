import { APP_INTERCEPTOR } from '@nestjs/core';
import { shutdownTracing } from './utils/tracer';
import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { CqrsModule } from '@nestjs/cqrs';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'path';
import { TransformInterceptor } from '@packages/core/interceptors';
import { CoreModule } from '@packages/core/core.module';
import { TypeOrmConfigService } from '@packages/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from '@packages/auth/auth.module';
import { TenantAuthService } from '@packages/auth/auth.service';
import { createGraphqlWsAuth } from '@packages/auth/graphql-ws-auth';
import { JobPostModule } from '@packages/jobPost/jobPost.module';
import { CrawlerModule } from '@packages/crawler/crawler.module';
import { AiModule } from '@packages/ai/ai.module';
import { SeedDataService } from '@packages/seeds/seed.service';
import { UserModule } from '@packages/user/user.module';
import { EmployeeModule } from '@packages/employee/employee.module';
import { EmployeeJobPostModule } from '@packages/employeeJobPost/employeeJobPost.module';
import { AppSagas } from './sagas/app.saga';
import config, { ConfigurationService } from '@packages/config';
import { EmployeeJobApplicationModule } from '@packages/employeeJobApplication/employeeJobApplication.module';
import { AutomationTaskModule } from '@packages/automationTask/automationTask.module';
import { TenantModule } from '@packages/tenant/tenant.module';
import { TenantApiKeyModule } from '@packages/tenantApiKey/tenantApiKey.module';
import { SourceConfigModule } from '@packages/sourceConfig/sourceConfig.module';
import { HealthModule } from '@packages/health/health.module';
import { DashboardModule } from '@packages/dashboard/dashboard.module';
import { TriggerModule } from '@packages/trigger/trigger.module';
import { OpsModule } from '@packages/ops/ops.module';
import { PluginsModule } from '@packages/plugin/plugin.registry';
import { INSTALLED_PLUGINS } from './plugins';
import { JobSearchCriteriaModule } from '@packages/jobSearchCriteria/jobSearchCriteria.module';

const autoSchemaFile = process.env.IS_NOT_SLS
	? join(process.cwd(), 'src/schemas/schema.graphql')
	: // TODO: when we run in Serverless, this should probably be different (for now we use the same path)
		join(process.cwd(), 'src/schemas/schema.graphql') + '';

console.log('Schema stored in ' + autoSchemaFile);
console.log('IS_NOT_SLS: ' + process.env.IS_NOT_SLS);

// For now let's enable debug, playground, introspection etc in production
// TODO: process.env.NODE_ENV == 'production' ? true : false;
// Deliberately false in every environment: GraphQL introspection stays on (the Ever Gauzy integration
// generates its client from the live schema) and Apollo 4 ignores `playground` anyway — the boolean only
// satisfies the driver's typing. Access is controlled by the auth guards, not by hiding the schema.
const isProd = false;

/** Flushes telemetry once the application has closed (enableShutdownHooks → SIGTERM → app.close()). */
@Injectable()
class TracingShutdown implements OnApplicationShutdown {
	async onApplicationShutdown(): Promise<void> {
		await shutdownTracing();
	}
}

@Module({
	imports: [
		MulterModule.register(),
		ConfigModule.forRoot({
			isGlobal: true,
			load: [config],
		}),
		// Async so the graphql-ws `onConnect` can authenticate subscription clients with the same
		// rules as HTTP requests (connectionParams = the same headers: X-APP-ID / X-API-KEY, ...).
		GraphQLModule.forRootAsync<ApolloDriverConfig>({
			driver: ApolloDriver,
			imports: [AuthModule],
			inject: [TenantAuthService],
			useFactory: (
				authService: TenantAuthService,
			): ApolloDriverConfig => {
				const wsAuth = createGraphqlWsAuth(authService);
				return {
					include: [
						TenantModule,
						TenantApiKeyModule,
						UserModule,
						EmployeeJobPostModule,
						JobSearchCriteriaModule,
						EmployeeModule,
						JobPostModule,
						EmployeeJobApplicationModule,
						AutomationTaskModule,
						SourceConfigModule,
						HealthModule,
						DashboardModule,
					],
					autoSchemaFile,
					introspection: !isProd,
					// Subscriptions authenticate with the same rules as HTTP and every WebSocket operation
					// re-validates the credentials (see createGraphqlWsAuth).
					subscriptions: {
						'graphql-ws': {
							onConnect: wsAuth.onConnect,
						},
					},
					context: wsAuth.context,
					// Apollo 4 types `playground` as a boolean (the old endpoint object was ignored); see `isProd` above
					playground: !isProd,
				};
			},
		}),
		CqrsModule,
		TypeOrmModule.forRootAsync({
			inject: [ConfigModule, ConfigurationService],
			useClass: TypeOrmConfigService,
		}),
		CoreModule,
		// the installed plugins: job sources (providers for the crawler) and capability descriptors
		PluginsModule.forRoot(INSTALLED_PLUGINS),
		AuthModule,
		TenantModule,
		TenantApiKeyModule,
		UserModule,
		// EmployeeJobApplicationModule before EmployeeJobPostModule: Nest registers routes in module order, and
		// `GET api/employee/job/:id` would otherwise capture `GET api/employee/job/application` (the list).
		EmployeeJobApplicationModule,
		EmployeeJobPostModule,
		JobSearchCriteriaModule,
		EmployeeModule,
		JobPostModule,
		AutomationTaskModule,
		// Crawler module — fetches jobs from Ever Jobs API (which aggregates all sources)
		CrawlerModule,
		AiModule,
		SourceConfigModule,
		HealthModule,
		DashboardModule,
		TriggerModule,
		OpsModule,
	],
	controllers: [AppController],
	providers: [
		TracingShutdown,
		ConfigurationService,
		AppService,
		TypeOrmConfigService,
		SeedDataService,
		AppSagas,
		{
			provide: APP_INTERCEPTOR,
			useClass: TransformInterceptor,
		},
	],
})
export class AppModule {}
