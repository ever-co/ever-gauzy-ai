import { join } from 'path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmConfigService } from '@packages/config';
import { JobPostModule } from '@packages/jobPost/jobPost.module';
import { CrawlerModule } from '@packages/crawler/crawler.module';
import { AiModule } from '@packages/ai/ai.module';
import { EmployeeModule } from '@packages/employee/employee.module';
import { UserModule } from '@packages/user/user.module';
import { EmployeeJobPostModule } from '@packages/employeeJobPost/employeeJobPost.module';
import config, { ConfigurationService } from '@packages/config';
import { SeedDataService } from './seed.service';

const autoSchemaFile = join(process.cwd(), 'src/schemas/schema.graphql');

console.log('Schema stored in ' + autoSchemaFile);

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [config],
		}),
		CqrsModule,
		TypeOrmModule.forRootAsync({
			inject: [ConfigModule, ConfigurationService],
			useClass: TypeOrmConfigService,
		}),
		UserModule,
		EmployeeModule,
		EmployeeJobPostModule,
		JobPostModule,
		CrawlerModule,
		AiModule,
	],
	controllers: [],
	providers: [ConfigurationService, TypeOrmConfigService, SeedDataService],
})
export class SeedAppModule {}
