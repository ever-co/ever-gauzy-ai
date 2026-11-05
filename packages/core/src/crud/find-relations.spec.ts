import { toFindRelations } from './find-relations';

describe('toFindRelations (TypeORM 1.x object-form relations)', () => {
	it('means "no relations" for missing or empty values', () => {
		expect(toFindRelations(undefined)).toBeUndefined();
		expect(toFindRelations(null)).toBeUndefined();
		expect(toFindRelations([])).toBeUndefined();
		expect(toFindRelations({})).toBeUndefined();
		expect(toFindRelations('employee')).toBeUndefined();
	});

	it('turns string paths into the nested object form', () => {
		expect(toFindRelations(['employee', 'jobPost'])).toEqual({ employee: true, jobPost: true });
		expect(toFindRelations(['employee', 'employee.user', 'employee.jobSearchCriteria'])).toEqual({
			employee: { user: true, jobSearchCriteria: true },
		});
		expect(toFindRelations(['employee.user', 'employee'])).toEqual({ employee: { user: true } });
		expect(toFindRelations([' tenant ', '', 7])).toEqual({ tenant: true });
	});

	it('passes the object form through', () => {
		expect(toFindRelations({ employee: { user: true } })).toEqual({ employee: { user: true } });
	});

	it('refuses prototype-related and non-identifier segments (no prototype pollution from request extras)', () => {
		expect(toFindRelations(['__proto__.polluted'])).toBeUndefined();
		expect(toFindRelations(['constructor.prototype.polluted', 'employee'])).toEqual({ employee: true });
		expect(toFindRelations(['employee.__proto__', 'jobPost'])).toEqual({ jobPost: true });
		expect(toFindRelations(['employee user', 'a-b', 'employee..user'])).toBeUndefined();
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(toFindRelations(JSON.parse('{"__proto__": {"polluted": true}, "employee": {"user": true}}'))).toEqual({ employee: { user: true } });
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});
