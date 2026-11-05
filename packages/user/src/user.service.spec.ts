import { UserService } from './user.service';

describe('UserService.findActiveByEmail', () => {
	const repo = { find: jest.fn() };
	// the CRUD base class constructor inspects a live repository; the method under test only needs `repo`
	const service: UserService = Object.assign(Object.create(UserService.prototype), { repo });
	beforeEach(() => jest.resetAllMocks());

	it('compares the e-mail case-insensitively on both sides and keeps the active-user / active-tenant filters', async () => {
		repo.find.mockResolvedValue([{ id: 'u-1' }]);
		await expect(service.findActiveByEmail('  Ann@Example.com ')).resolves.toEqual([{ id: 'u-1' }]);
		const query = repo.find.mock.calls[0][0];
		expect(query.where).toMatchObject({ isActive: true, isArchived: false, tenant: { isActive: true, isArchived: false } });
		expect(query.relations).toEqual({ tenant: true });
		const emailOperator = query.where.email;
		expect(emailOperator._type).toBe('raw');
		expect(emailOperator.getSql('"user"."email"')).toBe('LOWER("user"."email") = :email');
		expect(emailOperator.objectLiteralParameters).toEqual({ email: 'ann@example.com' });
	});

	it('never queries with an empty e-mail', async () => {
		await expect(service.findActiveByEmail('')).resolves.toEqual([]);
		await expect(service.findActiveByEmail(undefined as any)).resolves.toEqual([]);
		expect(repo.find).not.toHaveBeenCalled();
	});
});
