import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceConfig } from '@packages/entities';
import { SourceConfigResolver } from './sourceConfig.resolver';
import { SourceConfigService } from './sourceConfig.service';

/**
 * Module for the generic source configuration GraphQL API.
 *
 * Uses a single source_config table for all sources.
 * No per-source module dependencies needed.
 */
@Module({
	imports: [TypeOrmModule.forFeature([SourceConfig])],
	providers: [SourceConfigResolver, SourceConfigService],
	exports: [SourceConfigService],
})
export class SourceConfigModule {}
