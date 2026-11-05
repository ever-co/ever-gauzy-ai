import { SelfTenantAuthorizer } from './self-tenant.authorizer';

describe('SelfTenantAuthorizer', () => {
	it('restricts the Tenant type to the caller\'s own row', async () => {
		const filter = await new SelfTenantAuthorizer().authorize({ req: { tenant: { id: 't-1' } as any } });
		expect(filter).toEqual({ id: { eq: 't-1' } });
	});

	it('matches nothing when the request carries no tenant', async () => {
		const filter: any = await new SelfTenantAuthorizer().authorize({ req: {} });
		expect(filter.id.eq).toBe('00000000-0000-0000-0000-000000000000');
	});
});
