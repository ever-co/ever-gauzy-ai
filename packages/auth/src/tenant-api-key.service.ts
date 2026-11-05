// tenant-api-key.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { TenantAwareCrudService } from '@packages/core/crud';
import { TenantApiKey } from '@packages/entities';

@Injectable()
export class TenantApiKeyService extends TenantAwareCrudService<TenantApiKey> {
	constructor(
		@InjectRepository(TenantApiKey)
		protected readonly repo: Repository<TenantApiKey>,
	) {
		super(repo);
	}

	/**
	 * Find a TenantApiKey based on the provided API key.
	 * @param options The FindOptionsWhere object specifying the search criteria.
	 * @returns A Promise that resolves to a TenantApiKey or null if not found.
	 */
	async findApiKeyByOptions(
		options: FindOptionsWhere<TenantApiKey>
	): Promise<TenantApiKey | null> {
		try {
			const tenantApiKey = await this.repo.findOne({
				where: {
					...options,
					isActive: true,
					isArchived: false,
					// Also Filter by Tenant's isActive & isArchived flag
					tenant: {
						isActive: true, // Filter by related Tenant's isActive being true
						isArchived: false, // Filter by related Tenant's isArchived being false
					}
				},
				relations: {
					tenant: true, // Include the related Tenant entity in the result
				},
			});
			return tenantApiKey || null;
		} catch (error) {
			// Handle any errors that may occur during the database query
			console.error('Error fetching tenant_api_key: %s', error.message);
			return null;
		}
	}
}
