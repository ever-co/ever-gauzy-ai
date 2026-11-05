// The REST writes of /api/employee go through EmployeeService; the base CRUD service just echoes what it receives.
jest.mock('@packages/core/context', () => ({
	currentTenantWhere: () => ({ tenantId: 'tenant-1' }),
	RequestContext: { currentTenantId: () => 'tenant-1' },
}));
jest.mock('@packages/core/crud', () => ({
	TenantAwareCrudService: class {
		constructor(protected repo: any) {}
		async createOne(_req: unknown, dto: unknown) {
			return dto;
		}
		async createMany(_req: unknown, dto: { bulk: unknown[] }) {
			return dto.bulk;
		}
		async replaceOne(_req: unknown, dto: unknown) {
			return dto;
		}
		async updateOne(_req: unknown, dto: unknown) {
			return dto;
		}
	},
}));
jest.mock('@packages/entities', () => ({ Employee: class {} }));

import { EmployeeService } from './employee.service';

/** createdAt / updatedAt are stamped by the database: re-matching relies on them. */
describe('EmployeeService – REST writes ignore client timestamps', () => {
	const service = new EmployeeService({} as any);
	const req = {} as any;
	const stamped = { firstName: 'Ada', bio: 'TypeScript', createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01') } as any;

	it('create one / create many', async () => {
		expect(await service.createOne(req, { ...stamped })).toEqual({ firstName: 'Ada', bio: 'TypeScript' });
		expect(await service.createMany(req, { bulk: [{ ...stamped }, { firstName: 'Grace', updatedAt: new Date('2099-01-01') } as any] })).toEqual([
			{ firstName: 'Ada', bio: 'TypeScript' },
			{ firstName: 'Grace' },
		]);
	});

	it('update one / replace one', async () => {
		expect(await service.updateOne(req, { ...stamped })).toEqual({ firstName: 'Ada', bio: 'TypeScript' });
		expect(await service.replaceOne(req, { ...stamped })).toEqual({ firstName: 'Ada', bio: 'TypeScript' });
	});
});
