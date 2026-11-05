import type { AuthHeaders, AuthResult, TenantAuthService } from './auth.service';

/** WebSocket close code used when a connection's credentials are missing, expired or revoked. */
export const WS_CLOSE_UNAUTHORIZED = 4401;

/** How often an authenticated WebSocket connection re-validates its credentials while idle (default 5 min). */
export const DEFAULT_WS_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

/** Largest delay Node's setTimeout accepts; longer delays are clamped to 1 ms, which would fire immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface WsSocketLike {
	close(code: number, reason?: string): void;
	once?(event: 'close', listener: () => void): unknown;
}

/** `extra` of a graphql-ws connection (`{ socket, request }` from graphql-ws/use/ws) plus what we keep on it. */
export interface WsExtra {
	socket?: WsSocketLike;
	/** The credentials the client connected with (lower-case header names), re-checked per operation and periodically. */
	authHeaders?: AuthHeaders;
	/** Who the connection authenticated as: a re-validation that yields someone else closes it. */
	identity?: { tenantId?: string; userId?: string };
}

export interface GraphqlWsConnectContext {
	connectionParams?: Record<string, unknown> | null;
	extra: WsExtra;
}

/** What Apollo (HTTP) / graphql-ws (subscriptions) hand to the GraphQL `context` factory. */
export interface GqlContextParams {
	req?: Record<string, unknown>;
	res?: unknown;
	extra?: WsExtra;
}

export interface GraphqlWsAuthOptions {
	/** Interval between credential re-validations of an authenticated connection (ms). */
	revalidateIntervalMs?: number;
}

/** `connectionParams` of a subscription client, normalised like HTTP headers. */
/** The tenant and user an authentication result stands for. */
const identityOf = (auth: AuthResult | null | undefined): { tenantId?: string; userId?: string } => ({
	tenantId: auth?.tenant?.id,
	userId: auth?.user?.id,
});

const sameIdentity = (a: { tenantId?: string; userId?: string }, b: { tenantId?: string; userId?: string }): boolean =>
	a.tenantId === b.tenantId && a.userId === b.userId;

export function connectionHeaders(connectionParams?: Record<string, unknown> | null): AuthHeaders {
	const headers: AuthHeaders = {};
	for (const [name, value] of Object.entries(connectionParams ?? {})) {
		if (typeof value === 'string') headers[name.toLowerCase()] = value;
	}
	return headers;
}

/**
 * Authentication for GraphQL subscriptions (graphql-ws), applying the same rules as the HTTP
 * `AuthMiddleware` through `TenantAuthService.authenticate`:
 *
 *   - `onConnect`: a wrong credential throws and the socket is refused; no credential means an
 *     anonymous connection, which the global guard rejects per operation.
 *   - `context`: every operation re-authenticates the connection's credentials, so an expired JWT
 *     or a disabled API key cannot start new operations.
 *   - while connected, an authenticated connection re-validates its credentials periodically
 *     (`revalidateIntervalMs`, default 5 min, or `WS_REVALIDATE_INTERVAL_MS`) and at the JWT's
 *     `exp`, and is closed with 4401 as soon as they stop validating — or as soon as they identify
 *     a different tenant or user than at connect time (a membership moved to another tenant):
 *     running subscriptions were authorised for the original identity only.
 *
 * HTTP requests pass through `context` untouched: they were authenticated by the middleware.
 */
export function createGraphqlWsAuth(authService: Pick<TenantAuthService, 'authenticate'>, options: GraphqlWsAuthOptions = {}) {
	const revalidateIntervalMs = Math.max(
		1000,
		options.revalidateIntervalMs ?? Number(process.env.WS_REVALIDATE_INTERVAL_MS) ?? DEFAULT_WS_REVALIDATE_INTERVAL_MS
	) || DEFAULT_WS_REVALIDATE_INTERVAL_MS;

	/** Next check: at the interval, or at the credential's expiry when that comes first (never past setTimeout's limit). */
	const nextDelay = (expiresAt?: number): number => {
		const untilExpiry = expiresAt ? Math.max(0, expiresAt - Date.now()) : Infinity;
		return Math.min(revalidateIntervalMs, untilExpiry, MAX_TIMEOUT_MS);
	};

	const watchCredentials = (extra: WsExtra, initial: AuthResult): void => {
		const socket = extra.socket;
		const headers = extra.authHeaders;
		if (!socket || !headers) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let closed = false;
		const schedule = (delay: number) => {
			timer = setTimeout(check, delay);
			timer.unref?.();
		};
		const check = async () => {
			if (closed) return;
			try {
				const auth = await authService.authenticate(headers);
				if (!auth) {
					socket.close(WS_CLOSE_UNAUTHORIZED, 'Credentials revoked');
					return;
				}
				if (extra.identity && !sameIdentity(identityOf(auth), extra.identity)) {
					// e.g. the user's only active membership moved to another tenant: the running
					// subscriptions were authorised for the original tenant, not this one
					socket.close(WS_CLOSE_UNAUTHORIZED, 'Credentials now identify a different tenant or user');
					return;
				}
				if (auth.expiresAt && auth.expiresAt <= Date.now()) {
					socket.close(WS_CLOSE_UNAUTHORIZED, 'Credentials expired');
					return;
				}
				schedule(nextDelay(auth.expiresAt));
			} catch {
				socket.close(WS_CLOSE_UNAUTHORIZED, 'Credentials expired or revoked');
			}
		};
		schedule(nextDelay(initial.expiresAt));
		socket.once?.('close', () => {
			closed = true;
			if (timer) clearTimeout(timer);
		});
	};

	const onConnect = async (context: GraphqlWsConnectContext): Promise<void> => {
		const headers = connectionHeaders(context.connectionParams);
		const auth = await authService.authenticate(headers);
		context.extra.authHeaders = headers;
		if (auth) {
			context.extra.identity = identityOf(auth);
			watchCredentials(context.extra, auth);
		}
	};

	const context = async (params: GqlContextParams): Promise<{ req: Record<string, unknown>; res: unknown }> => {
		if (!params.extra?.authHeaders) {
			return { req: params.req, res: params.res };
		}
		let auth: AuthResult | null = null;
		try {
			auth = await authService.authenticate(params.extra.authHeaders);
		} catch {
			params.extra.socket?.close(WS_CLOSE_UNAUTHORIZED, 'Credentials expired or revoked');
		}
		if (auth && params.extra.identity && !sameIdentity(identityOf(auth), params.extra.identity)) {
			params.extra.socket?.close(WS_CLOSE_UNAUTHORIZED, 'Credentials now identify a different tenant or user');
			auth = null;
		}
		return { req: { ...(auth ?? {}) }, res: undefined };
	};

	return { onConnect, context, revalidateIntervalMs };
}
