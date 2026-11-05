import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RequestContext } from './request-context';
import { assertOwnedByCurrentTenant, currentTenantWhere, requireCurrentTenantId, resolveTenantId } from './tenant-scope';

describe('tenant-scope helpers', () => {
	afterEach(() => jest.restoreAllMocks());

	const withTenant = (id: string | null) => jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(id as any);

	it('requireCurrentTenantId returns the request tenant', () => {
		withTenant('t-1');
		expect(requireCurrentTenantId()).toBe('t-1');
		expect(currentTenantWhere()).toEqual({ tenantId: 't-1' });
	});

	it('requireCurrentTenantId refuses requests without a tenant', () => {
		withTenant(null);
		expect(() => requireCurrentTenantId()).toThrow(UnauthorizedException);
		expect(() => currentTenantWhere()).toThrow(UnauthorizedException);
	});

	it('resolveTenantId accepts no argument or the own tenant, refuses another tenant', () => {
		withTenant('t-1');
		expect(resolveTenantId()).toBe('t-1');
		expect(resolveTenantId('t-1')).toBe('t-1');
		expect(() => resolveTenantId('t-2')).toThrow(ForbiddenException);
	});

	it('assertOwnedByCurrentTenant reports foreign and missing rows as not found', () => {
		withTenant('t-1');
		expect(assertOwnedByCurrentTenant({ tenantId: 't-1' }, 'Row', 'x')).toEqual({ tenantId: 't-1' });
		expect(() => assertOwnedByCurrentTenant({ tenantId: 't-2' }, 'Row', 'x')).toThrow(NotFoundException);
		expect(() => assertOwnedByCurrentTenant(null, 'Row', 'x')).toThrow(NotFoundException);
	});
});
