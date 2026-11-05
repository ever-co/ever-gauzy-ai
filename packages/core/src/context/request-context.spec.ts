import { RequestContext } from './request-context';
import { RequestContextInterceptor } from './request-context.interceptor';
import { lastValueFrom, of, defer } from 'rxjs';

jest.mock('@nestjs/graphql', () => ({
	GqlExecutionContext: { create: (ctx: any) => ({ getContext: () => ctx.__gql }) },
}));

describe('RequestContext (AsyncLocalStorage)', () => {
	it('is empty outside a run and follows async continuations inside one', async () => {
		expect(RequestContext.currentTenantId()).toBeNull();
		const req: any = { tenant: { id: 't-1' } };
		const seen = await RequestContext.run(new RequestContext(req, {} as any), async () => {
			await new Promise((r) => setTimeout(r, 5));
			return RequestContext.currentTenantId();
		});
		expect(seen).toBe('t-1');
		expect(RequestContext.currentTenantId()).toBeNull();
	});
});

describe('RequestContextInterceptor', () => {
	const ctx = (type: string, gql?: any): any => ({ getType: () => type, __gql: gql });

	it('establishes a context for GraphQL operations that have none (WebSocket)', async () => {
		const handler = { handle: () => defer(async () => RequestContext.currentTenantId()) };
		const result = await lastValueFrom(new RequestContextInterceptor().intercept(ctx('graphql', { req: { tenant: { id: 't-ws' } } }), handler as any));
		expect(result).toBe('t-ws');
	});

	it('passes HTTP handlers and GraphQL contexts without a request through', async () => {
		const handler = { handle: () => of('passed') };
		expect(await lastValueFrom(new RequestContextInterceptor().intercept(ctx('http'), handler as any))).toBe('passed');
		expect(await lastValueFrom(new RequestContextInterceptor().intercept(ctx('graphql', {}), handler as any))).toBe('passed');
	});
});
