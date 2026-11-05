import { join } from 'path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmConfigService } from '@packages/config';
import { JobPostModule } from '@packages/jobPost/jobPost.module';
import { EmployeeModule } from '@packages/employee/employee.module';
import { UserModule } from '@packages/user/user.module';
import { EmployeeJobPostModule } from '@packages/employeeJobPost/employeeJobPost.module';
import { EmployeeJobApplicationModule } from '@packages/employeeJobApplication/employeeJobApplication.module';
import { AutomationTaskModule } from '@packages/automationTask/automationTask.module';
import { SchemaService } from './schema.service';
import { AiModule } from '@packages/ai/ai.module';
import { SeedDataService } from '@packages/seeds/seed.service';
import { ApolloDriver } from '@nestjs/apollo';
import config, { ConfigurationService } from '@packages/config';
import { TenantModule } from '@packages/tenant/tenant.module';
import { TenantApiKeyModule } from '@packages/tenantApiKey/tenantApiKey.module';
import { SourceConfigModule } from '@packages/sourceConfig/sourceConfig.module';
import { HealthModule } from '@packages/health/health.module';
import { DashboardModule } from '@packages/dashboard/dashboard.module';
import { JobSearchCriteriaModule } from '@packages/jobSearchCriteria/jobSearchCriteria.module';

const autoSchemaFile = process.env.IS_NOT_SLS
	? join(process.cwd(), 'src/schemas/schema.graphql')
	: // TODO: when we run in Serverless, this should probably be different (for now we use the same path)
	join(process.cwd(), 'src/schemas/schema.graphql') + '';

console.log('Schema stored in ' + autoSchemaFile);
console.log('IS_NOT_SLS: ' + process.env.IS_NOT_SLS);

// For now let's enable debug, playground, introspection etc in production
// TODO: process.env.NODE_ENV == 'production' ? true : false;
const isProd = false;

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [config],
		}),
		GraphQLModule.forRoot({
			include: [
				TenantModule,
				TenantApiKeyModule,
				UserModule,
				EmployeeModule,
				EmployeeJobPostModule,
				// the same GraphQL modules as AppModule, so the generated schema and SDK match the served API
				JobSearchCriteriaModule,
				JobPostModule,
				EmployeeJobApplicationModule,
				AutomationTaskModule,
				SourceConfigModule,
				// healthCheck and dashboardStats live on their own resolvers
				HealthModule,
				DashboardModule,
			],
			autoSchemaFile,
			// Disable debug in production
			debug: !isProd,
			tracing: !isProd,
			driver: ApolloDriver,
			introspection: !isProd,
			playground: isProd
				? false
				: {
					endpoint: process.env.IS_NOT_SLS
						? '/graphql'
						: `/${process.env.STAGE}/graphql`,
				},
		}),
		TypeOrmModule.forRootAsync({
			inject: [ConfigModule, ConfigurationService],
			useClass: TypeOrmConfigService,
		}),
		TenantModule,
		TenantApiKeyModule,
		UserModule,
		EmployeeModule,
		EmployeeJobPostModule,
		JobSearchCriteriaModule,
		JobPostModule,
		EmployeeJobApplicationModule,
		AutomationTaskModule,
		SourceConfigModule,
		HealthModule,
		DashboardModule,
		AiModule,
	],
	providers: [
		ConfigurationService,
		SchemaService,
		TypeOrmConfigService,
		SeedDataService,
	],
})
export class SchemaModule { }
