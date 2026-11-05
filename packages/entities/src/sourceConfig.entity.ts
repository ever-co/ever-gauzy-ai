import { Entity, Column, Index } from 'typeorm';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';
import { TenantOrganizationBaseEntity } from '@packages/core/entities/tenant-organization-base.entity';

/**
 * Source-agnostic configuration for any job source (Upwork, LinkedIn, Indeed, etc.).
 * Stores OAuth2 credentials, proxy settings, and general source preferences per tenant.
 */
@Entity('source_config')
export class SourceConfig extends TenantOrganizationBaseEntity {
	/** Which source this config is for: 'upwork', 'linkedin', 'indeed', etc. */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index()
	@Column()
	sourceCode: string;

	/** ID of Tenant in the client (external) system, e.g. in Gauzy */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	externalTenantId?: string;

	/** ID of Organization in the client (external) system, e.g. in Gauzy */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	externalOrgId?: string;

	/** ID of Organization in the source platform */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	sourceOrgId?: string;

	// ── OAuth2 credentials ──────────────────────────────────────

	/** OAuth2 grant type: 'client_credentials' or 'authorization_code' */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	grantType?: string;

	/** OAuth2 Client ID (application key) */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	clientId?: string;

	/** OAuth2 Client Secret */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	clientSecret?: string;

	/** OAuth2 access token */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	accessToken?: string;

	/** OAuth2 refresh token */
	@ApiPropertyOptional({ type: String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	refreshToken?: string;

	// ── General source settings ─────────────────────────────────

	/** Whether to use proxies for requests to this source */
	@ApiPropertyOptional({ type: Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
	useProxy?: boolean;

	/** Cache TTL override in seconds */
	@ApiPropertyOptional({ type: Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	cacheTtlSeconds?: number;

	/** Default number of results per crawl */
	@ApiPropertyOptional({ type: Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	resultsWanted?: number;
}
