import {
	CriteriaDeleteManyTouchEmployeesHook,
	CriteriaUpdateManyTouchFormerOwnersHook,
	CriterionDeleteOneTouchesEmployeeHook,
	CriterionUpdateOneTouchesFormerOwnerHook,
} from './criteria-owner-touch.hook';

/** Deleting or moving a criterion bumps its former employee's updatedAt, so re-matching notices. */
describe('criteria owner-touch hooks (job search criteria)', () => {
	const employees = { update: jest.fn() };
	const criteria = { findById: jest.fn(), query: jest.fn() };
	const ctx = (tenantId?: string): any => ({ req: tenantId ? { tenant: { id: tenantId } } : {} });
	const touched = () => employees.update.mock.calls.map(([where]) => where.id.value);

	beforeEach(() => jest.resetAllMocks());

	it('delete one: bumps the owner of a criterion of the caller\'s tenant (database clock)', async () => {
		criteria.findById.mockResolvedValue({ id: 'c-1', employeeId: 'e-1' });
		const instance = { id: 'c-1' };

		await expect(new CriterionDeleteOneTouchesEmployeeHook(employees as any, criteria as any).run(instance as any, ctx('t-1'))).resolves.toBe(instance);

		expect(criteria.findById).toHaveBeenCalledWith('c-1', { filter: { tenantId: { eq: 't-1' } } });
		expect(touched()).toEqual([['e-1']]);
		expect(employees.update.mock.calls[0][1].updatedAt()).toBe('CURRENT_TIMESTAMP');
	});

	it('delete one: touches nothing for another tenant\'s criterion or without a tenant', async () => {
		criteria.findById.mockResolvedValue(undefined);
		await new CriterionDeleteOneTouchesEmployeeHook(employees as any, criteria as any).run({ id: 'c-9' } as any, ctx('t-1'));
		await new CriterionDeleteOneTouchesEmployeeHook(employees as any, criteria as any).run({ id: 'c-1' } as any, ctx());

		expect(criteria.findById).toHaveBeenCalledTimes(1);
		expect(employees.update).not.toHaveBeenCalled();
	});

	it('delete many: bumps every owner of the (tenant-scoped) selection once', async () => {
		criteria.query.mockResolvedValue([
			{ id: 'c-1', employeeId: 'e-1' },
			{ id: 'c-2', employeeId: 'e-1' },
			{ id: 'c-3', employeeId: 'e-2' },
		]);
		const filter = { employeeId: { in: ['e-1', 'e-2'] }, tenantId: { eq: 't-1' } };

		await new CriteriaDeleteManyTouchEmployeesHook(employees as any, criteria as any).run({ filter } as any, ctx('t-1'));

		expect(criteria.query).toHaveBeenCalledWith({ filter });
		expect(touched()).toEqual([['e-1', 'e-2']]);
	});

	it('delete many: touches nothing when the selection is empty', async () => {
		criteria.query.mockResolvedValue([]);
		await new CriteriaDeleteManyTouchEmployeesHook(employees as any, criteria as any).run({ filter: {} } as any, ctx('t-1'));
		expect(employees.update).not.toHaveBeenCalled();
	});

	it('update one: bumps the former owner when a criterion moves to another employee, only then', async () => {
		criteria.findById.mockResolvedValue({ id: 'c-1', employeeId: 'e-1' });
		const hook = new CriterionUpdateOneTouchesFormerOwnerHook(employees as any, criteria as any);

		await hook.run({ id: 'c-1', update: { keyword: 'react' } } as any, ctx('t-1')); // the criterion's own timestamp covers it
		await hook.run({ id: 'c-1', update: { employeeId: 'e-1' } } as any, ctx('t-1')); // same owner
		await hook.run({ id: 'c-1', update: { employeeId: 'e-2' } } as any, ctx('t-1'));

		expect(touched()).toEqual([['e-1']]);
	});

	it('update many: bumps the former owners of moved criteria', async () => {
		criteria.query.mockResolvedValue([
			{ id: 'c-1', employeeId: 'e-1' },
			{ id: 'c-2', employeeId: 'e-3' },
		]);
		const hook = new CriteriaUpdateManyTouchFormerOwnersHook(employees as any, criteria as any);

		await hook.run({ filter: { tenantId: { eq: 't-1' } }, update: { isActive: false } } as any, ctx('t-1'));
		await hook.run({ filter: { tenantId: { eq: 't-1' } }, update: { employeeId: 'e-3' } } as any, ctx('t-1'));

		expect(criteria.query).toHaveBeenCalledTimes(1);
		expect(touched()).toEqual([['e-1']]);
	});
});
