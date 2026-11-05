import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SourceConfig } from '@packages/entities';
import { currentTenantWhere, requireCurrentTenantId } from '@packages/core/context';
import {
	CreateSourceConfigInput,
	UpdateSourceConfigInput,
	SourceConfigType,
} from './dto';

/**
 * Service for managing source configurations (any source: upwork, linkedin, indeed, etc.).
 * Uses the source_config table directly — no per-source module dependencies needed.
 */
@Injectable()
export class SourceConfigService {
	private readonly logger = new Logger(SourceConfigService.name);

	constructor(
		@InjectRepository(SourceConfig)
		private readonly repo: Repository<SourceConfig>,
	) {}

	// ── CREATE ───────────────────────────────────────────────────

	async create(dto: CreateSourceConfigInput): Promise<SourceConfigType> {
		const entity = new SourceConfig();

		entity.sourceCode = dto.sourceCode;
		entity.tenantId = requireCurrentTenantId();
		entity.externalTenantId = dto.tenantId;
		entity.externalOrgId = dto.orgId;
		entity.sourceOrgId = dto.sourceOrgId;

		if (dto.auth) {
			entity.grantType = dto.auth.grantType;
			entity.clientId = dto.auth.clientId;
			entity.clientSecret = dto.auth.clientSecret;
			entity.accessToken = dto.auth.accessToken;
			entity.refreshToken = dto.auth.refreshToken;

			// Auto-detect grant type if not explicitly set
			if (!entity.grantType) {
				entity.grantType = (entity.accessToken && entity.refreshToken)
					? 'authorization_code'
					: 'client_credentials';
			}
		}

		if (dto.settings) {
			entity.useProxy = dto.settings.useProxy;
			entity.cacheTtlSeconds = dto.settings.cacheTtlSeconds;
			entity.resultsWanted = dto.settings.resultsWanted;
		}

		const saved = await this.repo.save(entity);
		this.logger.log(`Created ${dto.sourceCode} config ${saved.id}`);
		return this.toResponse(saved);
	}

	// ── READ ─────────────────────────────────────────────────────

	async findAll(sourceCode?: string, tenantId?: string, orgId?: string): Promise<SourceConfigType[]> {
		const where: any = { ...currentTenantWhere(), isActive: true, isArchived: false };
		if (sourceCode) where.sourceCode = sourceCode;
		if (tenantId) where.externalTenantId = tenantId;
		if (orgId) where.externalOrgId = orgId;

		const configs = await this.repo.find({ where });
		return configs.map((c) => this.toResponse(c));
	}

	async findOne(id: string): Promise<SourceConfigType> {
		const config = await this.repo.findOne({ where: { id, ...currentTenantWhere() } });
		if (!config) throw new NotFoundException(`Config ${id} not found`);
		return this.toResponse(config);
	}

	/**
	 * The configuration a crawl may use for a source (e.g. 'upwork'), most specific first:
	 * the tenant's own config (for `sourceOrgId` when given, then any of the tenant's, organization
	 * id or not), then a deployment-wide config that belongs to no tenant. Another tenant's config
	 * is never returned: credentials are per tenant.
	 */
	async getConfigForSource(sourceCode: string, sourceOrgId?: string, tenantId?: string): Promise<SourceConfig | null> {
		// most specific first; a tenant's config may carry its organization id even when the caller
		// does not know it, so the tenant scope is searched with and then without the org predicate
		const scopes: Array<Record<string, unknown>> = [];
		if (tenantId) {
			if (sourceOrgId) scopes.push({ tenantId, sourceOrgId });
			scopes.push({ tenantId });
		}
		if (sourceOrgId) scopes.push({ tenantId: IsNull(), sourceOrgId });
		scopes.push({ tenantId: IsNull() });
		for (const scope of scopes) {
			const config = await this.repo.findOne({
				where: { sourceCode, isActive: true, isArchived: false, ...scope } as any,
			});
			if (config) return config;
		}
		return null;
	}

	// ── UPDATE ───────────────────────────────────────────────────

	async update(id: string, dto: UpdateSourceConfigInput): Promise<SourceConfigType> {
		const existing = await this.repo.findOne({ where: { id, ...currentTenantWhere() } });
		if (!existing) throw new NotFoundException(`Config ${id} not found`);

		if (dto.sourceOrgId !== undefined) existing.sourceOrgId = dto.sourceOrgId;

		if (dto.auth) {
			if (dto.auth.grantType !== undefined) existing.grantType = dto.auth.grantType;
			if (dto.auth.clientId !== undefined) existing.clientId = dto.auth.clientId;
			if (dto.auth.clientSecret !== undefined) existing.clientSecret = dto.auth.clientSecret;
			if (dto.auth.accessToken !== undefined) existing.accessToken = dto.auth.accessToken;
			if (dto.auth.refreshToken !== undefined) existing.refreshToken = dto.auth.refreshToken;

			// Re-detect grant type if it's not explicitly set
			if (!existing.grantType) {
				existing.grantType = (existing.accessToken && existing.refreshToken)
					? 'authorization_code'
					: 'client_credentials';
			}
		}

		if (dto.settings) {
			if (dto.settings.useProxy !== undefined) existing.useProxy = dto.settings.useProxy;
			if (dto.settings.cacheTtlSeconds !== undefined) existing.cacheTtlSeconds = dto.settings.cacheTtlSeconds;
			if (dto.settings.resultsWanted !== undefined) existing.resultsWanted = dto.settings.resultsWanted;
		}

		const saved = await this.repo.save(existing);
		this.logger.log(`Updated ${existing.sourceCode} config ${saved.id}`);
		return this.toResponse(saved);
	}

	// ── DELETE ───────────────────────────────────────────────────

	async remove(id: string): Promise<void> {
		const existing = await this.repo.findOne({ where: { id, ...currentTenantWhere() } });
		if (!existing) throw new NotFoundException(`Config ${id} not found`);

		await this.repo.remove(existing);
		this.logger.log(`Deleted config ${id}`);
	}

	// ── HELPERS ──────────────────────────────────────────────────

	private toResponse(entity: SourceConfig): SourceConfigType {
		return {
			id: entity.id,
			sourceCode: entity.sourceCode,
			tenantId: entity.externalTenantId,
			orgId: entity.externalOrgId,
			sourceOrgId: entity.sourceOrgId,
			auth: {
				grantType: entity.grantType,
				clientId: entity.clientId,
				// Never return secrets in full — mask them
				clientSecret: entity.clientSecret ? '***' + entity.clientSecret.slice(-4) : undefined,
				accessToken: entity.accessToken ? '***' + entity.accessToken.slice(-4) : undefined,
				refreshToken: entity.refreshToken ? '***' + entity.refreshToken.slice(-4) : undefined,
			},
			settings: {
				useProxy: entity.useProxy,
				cacheTtlSeconds: entity.cacheTtlSeconds,
				resultsWanted: entity.resultsWanted,
			},
			isActive: entity.isActive,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		};
	}
}
