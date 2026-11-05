import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable, from } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { RequestContext } from './request-context';

/**
 * GraphQL operations that arrive over WebSocket (graphql-ws) never pass through
 * `RequestContextMiddleware`, so `RequestContext.currentTenantId()` would be empty inside the
 * resolvers and services they call. This interceptor (registered globally) runs such handlers
 * inside a `RequestContext` built from the GraphQL context's `req`, which `onConnect` populated.
 * Operations that already have a context (HTTP) are passed through untouched.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType<string>() !== 'graphql' || RequestContext.currentRequestContext()) {
			return next.handle();
		}
		const gqlContext = GqlExecutionContext.create(context).getContext();
		const req = gqlContext?.req;
		if (!req) {
			return next.handle();
		}
		const requestContext = new RequestContext(req, gqlContext.res);
		// `next.handle()` only runs the handler once subscribed: subscribe inside the store so the
		// resolver, and everything it awaits, see the context.
		return from(RequestContext.run(requestContext, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
	}
}
