import {
	IsOptional,
	IsString,
	IsBoolean,
	IsNumber,
	IsNotEmpty,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ObjectType, InputType, Field, ID, Int, Float, GraphQLISODateTime } from '@nestjs/graphql';

// ─── GraphQL Object Types (Responses) ────────────────────────────────

/**
 * Auth credentials section of a source configuration response.
 * Secrets are always masked (only last 4 chars shown).
 */
@ObjectType('SourceAuth')
export class SourceAuthType {
	@Field(() => String, { nullable: true })
	grantType?: string;

	@Field(() => String, { nullable: true })
	clientId?: string;

	@Field(() => String, { nullable: true, description: 'Masked — only last 4 chars shown' })
	clientSecret?: string;

	@Field(() => String, { nullable: true, description: 'Masked — only last 4 chars shown' })
	accessToken?: string;

	@Field(() => String, { nullable: true, description: 'Masked — only last 4 chars shown' })
	refreshToken?: string;
}

/**
 * Settings section of a source configuration response.
 */
@ObjectType('SourceSettings')
export class SourceSettingsType {
	@Field(() => Boolean, { nullable: true })
	useProxy?: boolean;

	@Field(() => Int, { nullable: true })
	cacheTtlSeconds?: number;

	@Field(() => Int, { nullable: true })
	resultsWanted?: number;
}

/**
 * Source configuration response — returned by all queries and mutations.
 */
@ObjectType('SourceConfig')
export class SourceConfigType {
	@Field(() => ID)
	id: string;

	@Field(() => String)
	sourceCode: string;

	@Field(() => String, { nullable: true })
	tenantId?: string;

	@Field(() => String, { nullable: true })
	orgId?: string;

	@Field(() => String, { nullable: true })
	sourceOrgId?: string;

	@Field(() => SourceAuthType, { nullable: true })
	auth?: SourceAuthType;

	@Field(() => SourceSettingsType, { nullable: true })
	settings?: SourceSettingsType;

	@Field(() => Boolean)
	isActive: boolean;

	@Field(() => GraphQLISODateTime, { nullable: true })
	createdAt?: Date;

	@Field(() => GraphQLISODateTime, { nullable: true })
	updatedAt?: Date;
}

// ─── GraphQL Input Types (Requests) ──────────────────────────────────

/**
 * Auth credentials input — used for create and update mutations.
 */
@InputType('SourceAuthInput')
export class SourceAuthInput {
	@Field(() => String, { nullable: true, description: 'OAuth2 grant type (e.g. "client_credentials", "authorization_code")' })
	@IsOptional()
	@IsString()
	grantType?: string;

	@Field(() => String, { nullable: true, description: 'OAuth2 Client ID' })
	@IsOptional()
	@IsString()
	clientId?: string;

	@Field(() => String, { nullable: true, description: 'OAuth2 Client Secret' })
	@IsOptional()
	@IsString()
	clientSecret?: string;

	@Field(() => String, { nullable: true, description: 'Pre-obtained OAuth2 access token' })
	@IsOptional()
	@IsString()
	accessToken?: string;

	@Field(() => String, { nullable: true, description: 'OAuth2 refresh token' })
	@IsOptional()
	@IsString()
	refreshToken?: string;
}

/**
 * Settings input — used for create and update mutations.
 */
@InputType('SourceSettingsInput')
export class SourceSettingsInput {
	@Field(() => Boolean, { nullable: true, description: 'Whether to use proxies for this source' })
	@IsOptional()
	@IsBoolean()
	useProxy?: boolean;

	@Field(() => Int, { nullable: true, description: 'Cache TTL override in seconds' })
	@IsOptional()
	@IsNumber()
	cacheTtlSeconds?: number;

	@Field(() => Int, { nullable: true, description: 'Default number of results per crawl' })
	@IsOptional()
	@IsNumber()
	resultsWanted?: number;
}

/**
 * Input for creating a new source configuration.
 */
@InputType('CreateSourceConfigInput')
export class CreateSourceConfigInput {
	@Field(() => String, { description: 'Source identifier, e.g. "upwork", "linkedin"' })
	@IsNotEmpty()
	@IsString()
	sourceCode: string;

	@Field(() => String, { nullable: true, description: 'Tenant ID in the client system' })
	@IsOptional()
	@IsString()
	tenantId?: string;

	@Field(() => String, { nullable: true, description: 'Organization ID in the client system' })
	@IsOptional()
	@IsString()
	orgId?: string;

	@Field(() => String, { nullable: true, description: 'Source-specific org ID (e.g. Upwork Org ID)' })
	@IsOptional()
	@IsString()
	sourceOrgId?: string;

	@Field(() => SourceAuthInput, { nullable: true, description: 'Authentication credentials for this source' })
	@IsOptional()
	@ValidateNested()
	@Type(() => SourceAuthInput)
	auth?: SourceAuthInput;

	@Field(() => SourceSettingsInput, { nullable: true, description: 'Settings for this source' })
	@IsOptional()
	@ValidateNested()
	@Type(() => SourceSettingsInput)
	settings?: SourceSettingsInput;
}

/**
 * Input for updating an existing source configuration.
 */
@InputType('UpdateSourceConfigInput')
export class UpdateSourceConfigInput {
	@Field(() => String, { nullable: true, description: 'Source identifier (read-only, included for routing)' })
	@IsOptional()
	@IsString()
	sourceCode?: string;

	@Field(() => String, { nullable: true, description: 'Source-specific org ID (e.g. Upwork Org ID)' })
	@IsOptional()
	@IsString()
	sourceOrgId?: string;

	@Field(() => SourceAuthInput, { nullable: true, description: 'Authentication credentials for this source' })
	@IsOptional()
	@ValidateNested()
	@Type(() => SourceAuthInput)
	auth?: SourceAuthInput;

	@Field(() => SourceSettingsInput, { nullable: true, description: 'Settings for this source' })
	@IsOptional()
	@ValidateNested()
	@Type(() => SourceSettingsInput)
	settings?: SourceSettingsInput;
}
