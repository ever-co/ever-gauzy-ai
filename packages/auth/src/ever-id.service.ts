import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Injection token for `EverIdOptions` (tests inject a local JWKS; production reads the environment). */
export const EVER_ID_OPTIONS = 'EVER_ID_OPTIONS';

export interface EverIdOptions {
	/** OpenID Connect issuer (`EVER_ID_ISSUER_URL`, e.g. https://auth.ever.co), compared verbatim with `iss`. Unset = Ever ID sign-in off. */
	issuer?: string;
	/** Accepted `aud` values (`EVER_ID_AUDIENCE`, comma-separated client ids). Empty = any audience of the issuer. */
	audience?: string[];
	/** Key resolver; defaults to the issuer's JWKS discovered from `/.well-known/openid-configuration`. */
	jwks?: JWTVerifyGetKey;
}

/** What a verified Ever ID token tells us about the user. */
export interface EverIdIdentity {
	/** Stable user id at the issuer (`sub`). */
	subject: string;
	/** Verified e-mail address, as the issuer returned it. */
	email: string;
	/** When the token expires (ms since epoch). */
	expiresAt?: number;
	name?: string;
}

/** The issuer exactly as configured (trimmed): OpenID Connect requires `iss` to match it verbatim, trailing slash included. */
const configuredIssuer = (value?: string | null): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** How long discovery of the issuer's keys may take (`EVER_ID_DISCOVERY_TIMEOUT_MS`, default 10 s). */
const discoveryTimeoutMs = (): number => Number(process.env.EVER_ID_DISCOVERY_TIMEOUT_MS) || 10_000;

/**
 * Ever ID user tokens: OpenID Connect ID / access tokens issued by the Ever platform's identity
 * provider (Zitadel at https://auth.ever.co). Signatures are verified against the issuer's JWKS,
 * so no shared secret is needed; the issuer, expiry and (when configured) audience are enforced,
 * and the e-mail must be verified by the issuer. Everything else — which tenant the user belongs
 * to — is decided by `TenantAuthService` from Gauzy AI's own user records.
 */
@Injectable()
export class EverIdService {
	private readonly logger = new Logger(EverIdService.name);
	private readonly issuer?: string;
	private readonly audience: string[];
	private jwks?: JWTVerifyGetKey;
	private discovery?: Promise<JWTVerifyGetKey>;

	constructor(@Optional() @Inject(EVER_ID_OPTIONS) options: EverIdOptions = {}) {
		this.issuer = configuredIssuer(options.issuer ?? process.env.EVER_ID_ISSUER_URL);
		this.audience =
			options.audience ??
			(process.env.EVER_ID_AUDIENCE ?? '')
				.split(',')
				.map((a) => a.trim())
				.filter(Boolean);
		this.jwks = options.jwks;
	}

	public isEnabled(): boolean {
		return this.issuer !== undefined;
	}

	/** True when the (not yet verified) token claims to be issued by Ever ID; decides which bearer path handles it. */
	public isEverIdToken(token: string): boolean {
		if (!this.issuer) return false;
		try {
			return decodeJwt(token).iss === this.issuer;
		} catch {
			return false;
		}
	}

	/** Verifies signature, issuer, expiry (the `exp` claim is required) and audience; requires a verified e-mail. Throws otherwise. */
	public async verify(token: string): Promise<EverIdIdentity> {
		if (!this.issuer) {
			throw new Error('Ever ID is not configured (EVER_ID_ISSUER_URL)');
		}
		const { payload } = await jwtVerify(token, await this.keys(), {
			issuer: this.issuer,
			audience: this.audience.length ? this.audience : undefined,
			// a token without an expiry would be valid forever (and never close a WebSocket)
			requiredClaims: ['exp'],
		});
		const email = typeof payload.email === 'string' ? payload.email.trim() : '';
		if (!email || payload.email_verified !== true) {
			throw new Error('Ever ID token has no verified e-mail');
		}
		if (typeof payload.sub !== 'string' || !payload.sub) {
			throw new Error('Ever ID token has no subject');
		}
		return {
			subject: payload.sub,
			email,
			expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : undefined,
			name: typeof payload.name === 'string' ? payload.name : undefined,
		};
	}

	/** The issuer's keys, discovered once (`jwks_uri` from the OpenID configuration) and cached by jose. */
	private keys(): Promise<JWTVerifyGetKey> {
		if (this.jwks) return Promise.resolve(this.jwks);
		if (!this.discovery) {
			this.discovery = this.discover().catch((error) => {
				this.discovery = undefined; // try again on the next token
				throw error;
			});
		}
		return this.discovery;
	}

	private async discover(): Promise<JWTVerifyGetKey> {
		// a stalled issuer must fail authentication promptly, not hold every login and handshake
		const response = await fetch(`${this.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`, {
			signal: AbortSignal.timeout(discoveryTimeoutMs()),
		});
		if (!response.ok) {
			throw new Error(`Ever ID discovery failed: ${response.status} ${response.statusText}`);
		}
		const { jwks_uri: jwksUri } = (await response.json()) as { jwks_uri?: string };
		if (!jwksUri) {
			throw new Error('Ever ID discovery document has no jwks_uri');
		}
		this.logger.log(`Ever ID keys: ${jwksUri}`);
		this.jwks = createRemoteJWKSet(new URL(jwksUri));
		return this.jwks;
	}
}
