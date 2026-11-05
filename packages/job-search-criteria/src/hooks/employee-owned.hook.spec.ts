import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
	EmployeeOwnedCreateManyHook,
	EmployeeOwnedCreateOneHook,
	EmployeeOwnedUpdateManyHook,
	EmployeeOwnedUpdateOneHook,
} from './employee-owned.hook';

describe('EmployeeOwned hooks (job search criteria)', () => {
	const repo = { exists: jest.fn() };
	const ctx = (tenantId?: string): any => ({ req: tenantId ? { tenant: { id: tenantId } } : {} });
	beforeEach(() => jest.resetAllMocks());

	it('accepts an employee of the caller\'s tenant', async () => {
		repo.exists.mockResolvedValue(true);
		const hook = new EmployeeOwnedCreateOneHook(repo as any);
		await expect(hook.run({ input: { employeeId: 'e-1' } } as any, ctx('t-1'))).resolves.toBeDefined();
		expect(repo.exists).toHaveBeenCalledWith({ where: { id: 'e-1', tenantId: 't-1' } });
	});

	it('refuses an employee of another tenant (create one / many, update one / many)', async () => {
		repo.exists.mockResolvedValue(false);
		await expect(new EmployeeOwnedCreateOneHook(repo as any).run({ input: { employeeId: 'e-2' } } as any, ctx('t-1'))).rejects.toBeInstanceOf(ForbiddenException);
		await expect(new EmployeeOwnedCreateManyHook(repo as any).run({ input: [{ employeeId: 'e-1' }, { employeeId: 'e-2' }] } as any, ctx('t-1'))).rejects.toBeInstanceOf(ForbiddenException);
		await expect(new EmployeeOwnedUpdateOneHook(repo as any).run({ id: 'c-1', update: { employeeId: 'e-2' } } as any, ctx('t-1'))).rejects.toBeInstanceOf(ForbiddenException);
		await expect(new EmployeeOwnedUpdateManyHook(repo as any).run({ filter: {}, update: { employeeId: 'e-2' } } as any, ctx('t-1'))).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('ignores updates that do not touch employeeId and refuses calls without a tenant', async () => {
		await expect(new EmployeeOwnedUpdateOneHook(repo as any).run({ id: 'c-1', update: { keyword: 'x' } } as any, ctx('t-1'))).resolves.toBeDefined();
		expect(repo.exists).not.toHaveBeenCalled();
		await expect(new EmployeeOwnedCreateOneHook(repo as any).run({ input: { employeeId: 'e-1' } } as any, ctx())).rejects.toBeInstanceOf(UnauthorizedException);
	});
});
