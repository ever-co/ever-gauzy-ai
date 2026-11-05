import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response } from 'express';
import { v4 as uuidV4 } from 'uuid';

/**
 * Per-operation context (the authenticated request), readable from anywhere in the call chain.
 *
 * Backed by Node's AsyncLocalStorage so it follows promises, timers and RxJS subscriptions. It is
 * established by `RequestContextMiddleware` for HTTP requests and by `RequestContextInterceptor`
 * for GraphQL operations that did not go through the middleware (WebSocket subscriptions).
 */
export class RequestContext {
	private static readonly storage = new AsyncLocalStorage<RequestContext>();

	public readonly id: string;
	public request: Request;
	public response: Response;

	constructor(request: Request, response: Response) {
		this.id = uuidV4();
		this.request = request;
		this.response = response;
	}

	/** Runs `fn` with `context` as the current request context. */
	static run<T>(context: RequestContext, fn: () => T): T {
		return RequestContext.storage.run(context, fn);
	}

	/**
	 * Retrieves the current request context from the context storage.
	 * @returns The current RequestContext or null if not found.
	 */
	static currentRequestContext(): RequestContext | null {
		return RequestContext.storage.getStore() ?? null;
	}

	/**
	 * Retrieves the current request object from the active request context.
	 * @returns The current Request object or null if the request context is not available.
	 */
	static currentRequest(): Request | null {
		return RequestContext.currentRequestContext()?.request ?? null;
	}

	/**
	 * Retrieves the current tenant ID from the request context.
	 *
	 * @returns {string} The current tenant ID if available, or null if there is an error or the ID is not found.
	 */
	static currentTenantId(): string {
		try {
			const request: Request = RequestContext.currentRequest();
			return request['tenant']['id'];
		} catch (error) {
			return null;
		}
	}

	/**
	 * Get the current tenant's API key from the request context.
	 * @returns The current tenant's API key or null if not found.
	 */
	static currentTenantApiKey(): string | null {
		try {
			const request: Request | undefined = RequestContext.currentRequest();
			const tenantApiKey = request?.['tenantApiKey'];
			return tenantApiKey ?? null;
		} catch (error) {
			console.error(`Error while retrieving current tenant API key: ${error.message}`);
			return null;
		}
	}
}
