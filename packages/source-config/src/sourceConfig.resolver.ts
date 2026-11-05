import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { SourceConfigService } from './sourceConfig.service';
import {
	SourceConfigType,
	CreateSourceConfigInput,
	UpdateSourceConfigInput,
} from './dto';

/**
 * GraphQL resolver for managing per-source configurations.
 *
 * All sources share a single set of queries/mutations; the `sourceCode`
 * field in the input determines which internal entity/table is used.
 */
@Resolver(() => SourceConfigType)
export class SourceConfigResolver {
	constructor(private readonly service: SourceConfigService) {}

	@Mutation(() => SourceConfigType, { description: 'Create a source configuration' })
	async createSourceConfig(
		@Args('input') input: CreateSourceConfigInput,
	): Promise<SourceConfigType> {
		return this.service.create(input);
	}

	@Query(() => [SourceConfigType], { name: 'sourceConfigs', description: 'List source configurations' })
	async sourceConfigs(
		@Args('sourceCode', { nullable: true }) sourceCode?: string,
		@Args('tenantId', { nullable: true }) tenantId?: string,
		@Args('orgId', { nullable: true }) orgId?: string,
	): Promise<SourceConfigType[]> {
		return this.service.findAll(sourceCode, tenantId, orgId);
	}

	@Query(() => SourceConfigType, { name: 'sourceConfig', description: 'Get a source configuration by ID' })
	async sourceConfig(
		@Args('id', { type: () => ID }) id: string,
	): Promise<SourceConfigType> {
		return this.service.findOne(id);
	}

	@Mutation(() => SourceConfigType, { description: 'Update a source configuration' })
	async updateSourceConfig(
		@Args('id', { type: () => ID }) id: string,
		@Args('input') input: UpdateSourceConfigInput,
	): Promise<SourceConfigType> {
		return this.service.update(id, input);
	}

	@Mutation(() => Boolean, { description: 'Delete a source configuration' })
	async removeSourceConfig(
		@Args('id', { type: () => ID }) id: string,
	): Promise<boolean> {
		await this.service.remove(id);
		return true;
	}
}
