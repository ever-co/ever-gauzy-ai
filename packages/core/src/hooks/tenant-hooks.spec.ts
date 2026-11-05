import { CreateManyByTenantHook } from './create-many-by-tenant.hook';
import { CreateOneByTenantHook } from './create-one-by-tenant.hook';
import { UpdateManyByTenantHook } from './update-many-by-tenant.hook';
import { UpdateOneByTenantHook } from './update-one-by-tenant.hook';

describe('tenant hooks: payloads are pinned to the authenticated tenant and ids are read-only', () => {
	const ctx: any = { req: { tenant: { id: 't-1' } } };

	it('create one / many: drops a caller-supplied id and stamps tenantId', async () => {
		const one = await new CreateOneByTenantHook().run({ input: { id: 'foreign', keyword: 'react', tenantId: 't-2' } } as any, ctx);
		expect(one.input).toEqual({ keyword: 'react', tenantId: 't-1' });
		const many = await new CreateManyByTenantHook().run({ input: [{ id: 'a', keyword: 'x' }, { keyword: 'y' }] } as any, ctx);
		expect(many.input).toEqual([{ keyword: 'x', tenantId: 't-1' }, { keyword: 'y', tenantId: 't-1' }]);
	});

	it('update one: the primary key cannot be changed through the update payload', async () => {
		const result = await new UpdateOneByTenantHook().run({ id: 'mine', update: { id: 'foreign', keyword: 'react', tenantId: 't-2' } } as any, ctx);
		expect(result.id).toBe('mine');
		expect(result.update).toEqual({ keyword: 'react', tenantId: 't-1' });
	});

	it('update many: filters by tenant and strips id from the payload', async () => {
		const result = await new UpdateManyByTenantHook().run({ filter: { keyword: { eq: 'x' } }, update: { id: 'foreign', isActive: false } } as any, ctx);
		// the tenant filter is AND-ed with the caller's filter (exact nesting is nestjs-query's mergeFilter's business)
		expect(JSON.stringify(result.filter)).toContain('"tenantId":{"eq":"t-1"}');
		expect(JSON.stringify(result.filter)).toContain('"keyword":{"eq":"x"}');
		expect(result.update).toEqual({ isActive: false, tenantId: 't-1' });
	});

	it('leaves the payload alone when there is no tenant (the guard rejects the request anyway)', async () => {
		const result = await new UpdateOneByTenantHook().run({ id: 'mine', update: { id: 'x' } } as any, { req: {} } as any);
		expect(result.update).toEqual({ id: 'x' });
	});
});
