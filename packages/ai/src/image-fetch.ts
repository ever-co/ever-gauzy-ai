import {
	isPrivateAddress,
	normalizeAddress,
	pinnedRequest,
	PinnedResponse,
	PublicTarget,
	resolvePublicUrl,
	Resolver,
	UnsafeUrlError,
} from '@packages/core/net/public-url';

export { isPrivateAddress, normalizeAddress };

/** A downloaded image in the shape the analysis expects (same as an uploaded file). */
export interface FetchedImage {
	buffer: Buffer;
	mimetype: string;
	originalname: string;
	size: number;
	url: string;
}

/** What a transport returns for a pinned GET; the body is read with the size cap. */
export type TransportResponse = PinnedResponse;

/** Performs the GET for `url`, connecting to the already validated `address` (never resolving the hostname again). */
export type ImageTransport = (url: URL, address: string, init: { signal: AbortSignal }) => Promise<TransportResponse>;

export interface ImageFetchOptions {
	/** Largest image accepted (bytes); default IMAGE_FETCH_MAX_BYTES or 10 MB. */
	maxBytes?: number;
	/** Deadline for the whole operation, resolution included (ms); default IMAGE_FETCH_TIMEOUT_MS or 15 s. */
	timeoutMs?: number;
	/** Address resolver (tests inject one). */
	resolve?: Resolver;
	/** Transport (tests inject one); the default pins the connection to the validated address. */
	transport?: ImageTransport;
}

export class ImageFetchError extends Error {
	constructor(
		message: string,
		public readonly url: string
	) {
		super(message);
	}
}

/**
 * Default transport: the pinned request of `@packages/core/net/public-url` (connection to the
 * validated address, TLS still verified against the hostname, redirects not followed), as a GET
 * that asks for images.
 */
export const pinnedTransport: ImageTransport = (url, address, { signal }) =>
	pinnedRequest(url, address, { method: 'GET', headers: { 'user-agent': 'gauzy-ai-image-fetch/1', accept: 'image/*' }, signal });

/**
 * Downloads an image from an `http(s)` URL for analysis, with the guards a public endpoint needs:
 * only public addresses (the hostname is resolved once, every address checked, and the connection
 * pinned to the validated address), an image content type, a size cap enforced while streaming,
 * no redirects, and one deadline over resolution and download. A signed URL (e.g. a storage
 * bucket link with an embedded token) works as is; nothing else is sent with the request.
 */
export async function fetchImage(url: string, options: ImageFetchOptions = {}): Promise<FetchedImage> {
	const envMax = Number(process.env.IMAGE_FETCH_MAX_BYTES);
	const limit = options.maxBytes ?? (envMax > 0 ? envMax : 10 * 1024 * 1024);
	const timeoutMs = options.timeoutMs ?? (Number(process.env.IMAGE_FETCH_TIMEOUT_MS) || 15_000);
	const resolve = options.resolve;
	const transport = options.transport ?? pinnedTransport;
	const deadline = AbortSignal.timeout(timeoutMs);

	let target: PublicTarget;
	try {
		target = await resolvePublicUrl(url, { resolve, signal: deadline });
	} catch (error) {
		throw error instanceof UnsafeUrlError ? new ImageFetchError(error.message, url) : error;
	}
	const parsed = target.url;

	// the connection is pinned to the first validated address: what was checked is what is reached;
	// the request owns an abort so a rejected response never keeps its socket until the deadline
	const controller = new AbortController();
	const signal = AbortSignal.any([deadline, controller.signal]);
	const response = await transport(parsed, target.address, { signal }).catch((error) => {
		throw new ImageFetchError(`Download failed: ${error.message}`, url);
	});
	try {
		return await readImage(response, parsed, url, limit, deadline);
	} catch (error) {
		controller.abort();
		response.abort();
		throw error;
	}
}

/** Validates the answered response and reads the body with the size cap. */
async function readImage(response: TransportResponse, parsed: URL, url: string, limit: number, deadline: AbortSignal): Promise<FetchedImage> {
	if (response.status >= 300 && response.status < 400) {
		throw new ImageFetchError('Redirects are not followed', url);
	}
	if (response.status < 200 || response.status >= 300) {
		throw new ImageFetchError(`Download failed: HTTP ${response.status}`, url);
	}
	const mimetype = (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
	if (!mimetype.startsWith('image/')) {
		throw new ImageFetchError(`Not an image (content-type ${mimetype || 'missing'})`, url);
	}
	const declared = Number(response.headers['content-length']);
	if (declared > limit) {
		throw new ImageFetchError(`Image larger than ${limit} bytes`, url);
	}
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for await (const chunk of response.body) {
			size += chunk.byteLength;
			if (size > limit) {
				throw new ImageFetchError(`Image larger than ${limit} bytes`, url);
			}
			chunks.push(chunk);
		}
	} catch (error) {
		if (error instanceof ImageFetchError) throw error;
		throw new ImageFetchError(`Download failed: ${deadline.aborted ? 'timed out' : error.message}`, url);
	}
	const buffer = Buffer.concat(chunks);
	return { buffer, mimetype, originalname: basenameOf(parsed), size: buffer.length, url };
}

/** The decoded last path segment ("screen%201.png" → "screen 1.png"); kept escaped when it is not valid UTF-8 ("shot%FF.png"). */
function basenameOf(url: URL): string {
	const escaped = url.pathname.split('/').filter(Boolean).pop() ?? 'image';
	try {
		return decodeURIComponent(escaped);
	} catch {
		return escaped;
	}
}
