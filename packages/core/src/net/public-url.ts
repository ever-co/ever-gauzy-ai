import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, isIPv6 } from 'node:net';

/**
 * Server-side requests to URLs that come from outside (screenshot links, stored job URLs): the
 * guards every such request needs, in one place. A URL is accepted only when it is `http(s)`,
 * carries no credentials, and its hostname resolves to public addresses only; the request is then
 * pinned to the validated address (no second resolution, no DNS rebinding) and never follows a
 * redirect, so what was checked is what is reached.
 */

export class UnsafeUrlError extends Error {
	constructor(
		message: string,
		public readonly url: string
	) {
		super(message);
	}
}

/**
 * Canonical form of an address for the private-range checks: brackets removed, lower-case, and
 * IPv4-mapped IPv6 (`::ffff:127.0.0.1` as well as the hex form `::ffff:7f00:1` the URL parser
 * produces) turned into the dotted IPv4 it stands for.
 */
export function normalizeAddress(address: string): string {
	let ip = address.trim().replace(/^\[|\]$/g, '').toLowerCase();
	if (isIPv6(ip)) {
		// expand "::ffff:a.b.c.d" / "::ffff:xxxx:yyyy" / "0:0:0:0:0:ffff:xxxx:yyyy"
		const mapped = ip.match(/^(?:0*:)*ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/) ?? ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
		if (mapped) {
			const hi = parseInt(mapped[1], 16);
			const lo = parseInt(mapped[2], 16);
			ip = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
		} else {
			const dotted = ip.match(/^(?:0*:)*ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
			if (dotted) ip = dotted[1];
		}
	}
	return ip;
}

/** Addresses a public API must never be told to connect to (the server's own network). */
export function isPrivateAddress(address: string): boolean {
	const ip = normalizeAddress(address);
	if (isIP(ip) === 4) {
		const [a, b] = ip.split('.').map(Number);
		return (
			a === 10 ||
			a === 127 ||
			a === 0 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127)
		);
	}
	if (isIP(ip) === 6) {
		if (ip === '::1' || ip === '::' || /^(0*:)+0*1$/.test(ip)) return true;
		const first = parseInt(ip.split(':')[0] || '0', 16);
		// fc00::/7 (unique local) and fe80::/10 (link-local), by prefix bits rather than text prefixes
		return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
	}
	return ip === 'localhost' || ip.endsWith('.localhost') || ip.endsWith('.local') || ip.endsWith('.internal');
}

/** Resolves a hostname to all its addresses (tests inject their own). */
export type Resolver = (hostname: string) => Promise<string[]>;

export const defaultResolve: Resolver = async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address);

/** Rejects with "<what> timed out" when the signal fires before the promise settles. */
export const withDeadline = <T>(promise: Promise<T>, signal: AbortSignal, what: string): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new Error(`${what} timed out`));
		if (signal.aborted) return onAbort();
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});

/** A validated URL with the public address the request must connect to. */
export interface PublicTarget {
	url: URL;
	address: string;
}

/**
 * Parses and validates a URL for a server-side request: `http(s)` only, no credentials, the
 * hostname resolved once (within `signal`'s deadline) with every address checked against the
 * private ranges. Throws `UnsafeUrlError` with the reason.
 */
export async function resolvePublicUrl(url: string, options: { resolve?: Resolver; signal: AbortSignal }): Promise<PublicTarget> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new UnsafeUrlError('Not a valid URL', url);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new UnsafeUrlError('Only http(s) URLs are accepted', url);
	}
	if (parsed.username || parsed.password) {
		throw new UnsafeUrlError('Credentials in the URL are not accepted', url);
	}
	const hostname = parsed.hostname;
	const literal = hostname.replace(/^\[|\]$/g, '');
	const resolve = options.resolve ?? defaultResolve;
	const addresses = isIP(literal) ? [literal] : await withDeadline(resolve(hostname), options.signal, 'Name resolution').catch(() => [] as string[]);
	if (addresses.length === 0) {
		throw new UnsafeUrlError('Host cannot be resolved', url);
	}
	if (isPrivateAddress(hostname) || addresses.some(isPrivateAddress)) {
		throw new UnsafeUrlError('URL points to a private or local address', url);
	}
	return { url: parsed, address: addresses[0] };
}

/** What a pinned request answers; the body is a stream the caller reads (or not) with its own limits. */
export interface PinnedResponse {
	status: number;
	statusText?: string;
	headers: Record<string, string | undefined>;
	body: AsyncIterable<Uint8Array>;
	/** Drops the connection (call it whenever the response is rejected, or when the body is not read). */
	abort: () => void;
}

export interface PinnedRequestInit {
	method?: 'GET' | 'HEAD';
	headers?: Record<string, string>;
	signal: AbortSignal;
}

/** Performs a request for `url` connecting to the validated `address` (tests inject their own). */
export type PinnedRequest = (url: URL, address: string, init: PinnedRequestInit) => Promise<PinnedResponse>;

/**
 * `http(s).request` with a `lookup` that returns the validated address, so the connection goes
 * where the check went while TLS still verifies the certificate against the hostname. Redirects
 * are never followed: a 3xx comes back as is, with its `location` header, for the caller to judge.
 */
export const pinnedRequest: PinnedRequest = (url, address, { method = 'GET', headers = {}, signal }) =>
	new Promise<PinnedResponse>((resolve, reject) => {
		const family = isIPv6(address) ? 6 : 4;
		const mod = url.protocol === 'https:' ? https : http;
		const req = mod.request(
			url,
			{
				method,
				signal,
				headers,
				lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) =>
					options?.all ? callback(null, [{ address, family }]) : callback(null, address, family)) as never,
			},
			(res) => {
				const responseHeaders: Record<string, string | undefined> = {};
				for (const [name, value] of Object.entries(res.headers)) {
					responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
				}
				resolve({
					status: res.statusCode ?? 0,
					statusText: res.statusMessage,
					headers: responseHeaders,
					body: res as AsyncIterable<Uint8Array>,
					abort: () => {
						res.destroy();
						req.destroy();
					},
				});
			}
		);
		req.on('error', reject);
		req.end();
	});
