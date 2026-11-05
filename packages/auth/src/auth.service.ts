import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { verify } from 'jsonwebtoken';
import { pick } from 'lodash';
import { AuthMethod } from '@packages/core/enums';
import { ITenant, ITenantApiKey } from '@packages/core/interfaces';
import { TenantApiKeyService } from './tenant-api-key.service';
import { UserService } from '@packages/user/user.service';
import { EverIdIdentity, EverIdService } from './ever-id.service';

/** Headers (lower-case names) of an HTTP request or the `connectionParams` of a WebSocket subscription. */
export type AuthHeaders = Record<string, string | undefined>;

/** What a successful authentication attaches to the request / GraphQL context. */
export interface AuthResult {
	authMethod: AuthMethod;
	tenant?: ITenant | null;
	tenantApiKey?: Partial<ITenantApiKey>;
	user?: { id?: string; tenantId?: string };
	/** When the credential stops being valid (JWT `exp`, in ms); absent for API keys and service tokens. */
	expiresAt?: number;
}

const isNotEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Authenticates a set of headers. Used by `AuthMiddleware` (HTTP) and by the `graphql-ws`
 * `onConnect` handler (subscriptions), so both transports apply exactly the same rules.
 *
 * Supported credentials, in order:
 *   1. API key + secret (`X-APP-ID` / `X-API-KEY`) — machine-to-machine (e.g. the Ever Gauzy
 *      integration plugin). The secret is compared against the stored SHA-256 hash.
 *   2. Ever ID user token (`Authorization: Bearer <OpenID Connect token>` issued by
 *      `EVER_ID_ISSUER_URL`, verified against the issuer's keys) — users of the Ever platform.
 *      The user is matched by verified e-mail; `Tenant-Id` picks the tenant when the user belongs
 *      to several.
 *   3. Tenant JWT (`Tenant-Id` + `Authorization: Bearer <jwt>` signed with `JWT_SECRET`) —
 *      legacy user tokens issued by the integrating platform; `id` and `tenantId` claims are required.
 *   4. Service token (`X-SERVICE-TOKEN` = `SERVICE_API_TOKEN`) — internal schedulers calling
 *      tenant-less endpoints (crawler, ops).
 *
 * Returns `null` for an anonymous request (the global guard then refuses it) and throws for a
 * credential that is present but wrong. Never logs a credential.
 */
@Injectable()
export class TenantAuthService {
	private readonly logger = new Logger(TenantAuthService.name);

	constructor(
		private readonly tenantApiKeyService: TenantApiKeyService,
		private readonly userService: UserService,
		private readonly everIdService: EverIdService
	) {}

	async authenticate(headers: AuthHeaders): Promise<AuthResult | null> {
		const h = (name: string) => headers[name.toLowerCase()];
		const apiKey = h('x-app-id');
		const apiSecret = h('x-api-key');
		const tenantIdHeader = h('tenant-id');
		const authorization = h('authorization');
		const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
		const serviceToken = h('x-service-token');

		// Way-#1 API key & secret
		if (process.env.IS_DISABLE_API_KEY_AUTH !== 'true' && isNotEmpty(apiKey) && isNotEmpty(apiSecret)) {
			const tenantApiKey = await this.tenantApiKeyService.findApiKeyByOptions({ apiKey });
			if (!tenantApiKey || !this.validateApiKey(apiSecret, tenantApiKey.apiSecret)) {
				throw new ForbiddenException('Not Authorized');
			}
			this.logger.debug(`Authenticated tenant ${tenantApiKey.tenant?.id} via API key`);
			return {
				authMethod: AuthMethod.ApiKey,
				tenant: tenantApiKey.tenant ?? null,
				tenantApiKey: pick(tenantApiKey, ['apiKey', 'apiSecret', 'openAiSecretKey', 'openAiOrganizationId']),
			};
		}

		// Way-#2 Ever ID (OpenID Connect) user token
		if (
			process.env.IS_DISABLE_BEARER_TOKEN_AUTH !== 'true' &&
			isNotEmpty(bearerToken) &&
			this.everIdService.isEverIdToken(bearerToken)
		) {
			let identity: EverIdIdentity;
			try {
				identity = await this.everIdService.verify(bearerToken);
			} catch (error) {
				this.logger.debug(`Ever ID token rejected: ${error.message}`);
				throw new ForbiddenException('Not Authorized');
			}
			const user = this.pickTenantUser(await this.userService.findActiveByEmail(identity.email), tenantIdHeader);
			const tenantApiKey = await this.tenantApiKeyService.findApiKeyByOptions({ tenantId: user.tenantId });
			this.logger.debug(`Authenticated user ${user.id} of tenant ${user.tenantId} via Ever ID`);
			return {
				authMethod: AuthMethod.EverId,
				tenant: user.tenant ?? tenantApiKey?.tenant ?? null,
				tenantApiKey: tenantApiKey
					? pick(tenantApiKey, ['apiKey', 'apiSecret', 'openAiSecretKey', 'openAiOrganizationId'])
					: undefined,
				user: { id: user.id, tenantId: user.tenantId },
				expiresAt: identity.expiresAt,
			};
		}

		// Way-#3 Tenant-ID & legacy bearer JWT
		if (
			process.env.IS_DISABLE_BEARER_TOKEN_AUTH !== 'true' &&
			isNotEmpty(tenantIdHeader) &&
			isNotEmpty(bearerToken) &&
			isNotEmpty(process.env.JWT_SECRET)
		) {
			let payload: any;
			try {
				payload = verify(bearerToken, process.env.JWT_SECRET);
			} catch {
				throw new ForbiddenException('Not Authorized');
			}
			const { id: userId, employeeId, tenantId, exp } = (payload ?? {}) as Record<string, unknown>;
			// A signed token without identity claims must not widen the lookup to "any user".
			if (!isNotEmpty(userId) || !isNotEmpty(tenantId)) {
				throw new ForbiddenException('Not Authorized');
			}
			const user = await this.userService.findUserByExternalOptions({
				externalUserId: userId,
				externalEmployeeId: isNotEmpty(employeeId) ? employeeId : undefined,
				externalTenantId: tenantId,
			});
			if (!user) {
				throw new ForbiddenException('Not Authorized');
			}
			const tenantApiKey = await this.tenantApiKeyService.findApiKeyByOptions({ tenantId: user.tenantId });
			if (!tenantApiKey) {
				throw new ForbiddenException('Not Authorized');
			}
			this.logger.debug(`Authenticated user ${user.id} of tenant ${tenantApiKey.tenant?.id} via bearer token`);
			return {
				authMethod: AuthMethod.BearerToken,
				tenant: tenantApiKey.tenant ?? null,
				tenantApiKey: pick(tenantApiKey, ['apiKey', 'apiSecret', 'openAiSecretKey', 'openAiOrganizationId']),
				user: { id: user.id, tenantId: user.tenantId },
				expiresAt: typeof exp === 'number' ? exp * 1000 : undefined,
			};
		}

		// Way-#4 Service token (no tenant)
		const expected = process.env.SERVICE_API_TOKEN;
		if (isNotEmpty(serviceToken) && isNotEmpty(expected)) {
			if (!this.safeEqual(serviceToken, expected)) {
				throw new ForbiddenException('Not Authorized');
			}
			this.logger.debug('Authenticated internal service token');
			return { authMethod: AuthMethod.ServiceToken };
		}

		return null;
	}

	/**
	 * The Gauzy AI user record an Ever ID identity maps to. A user exists per tenant, so when the
	 * e-mail is known in several tenants the caller must say which one with `Tenant-Id` (our tenant
	 * id or the integrating platform's external tenant id).
	 */
	private pickTenantUser(
		users: Array<{ id?: string; tenantId?: string; externalTenantId?: string; tenant?: ITenant | null }>,
		tenantIdHeader?: string
	) {
		const candidates = isNotEmpty(tenantIdHeader)
			? users.filter(
					(u) =>
						u.tenantId === tenantIdHeader ||
						u.externalTenantId === tenantIdHeader ||
						(u.tenant as { externalTenantId?: string } | null)?.externalTenantId === tenantIdHeader
				)
			: users;
		if (candidates.length === 0) {
			throw new ForbiddenException('Not Authorized');
		}
		if (candidates.length > 1) {
			throw new ForbiddenException('Tenant-Id header required: this user belongs to several tenants');
		}
		return candidates[0];
	}

	/** Compares the presented secret with the stored SHA-256 hash in constant time. */
	private validateApiKey(secretKey: string, apiSecretHash: string): boolean {
		return this.safeEqual(createHash('sha256').update(secretKey).digest('hex'), apiSecretHash ?? '');
	}

	private safeEqual(a: string, b: string): boolean {
		const bufA = Buffer.from(a);
		const bufB = Buffer.from(b);
		return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
	}
}
