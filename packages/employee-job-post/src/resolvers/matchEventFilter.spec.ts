jest.mock('@packages/dashboard/dashboard.service', () => ({ DashboardService: class {} }));
jest.mock('../employeeJobPost.service', () => ({ EmployeeJobPostService: class {}, MATCH_CREATED_EVENT: 'employeeJobPostCreated', MATCH_UPDATED_EVENT: 'employeeJobPostUpdated' }));
import { matchEventFilter } from './employeeJobPost.resolver';

describe('matchEventFilter', () => {
	const f = matchEventFilter('ev');
	const ctx = (id?: string) => ({ req: { tenant: id ? { id } : undefined } });
	it('delivers only the own tenant\'s events, optionally for one employee', () => {
		expect(f({ ev: { tenantId: 't-1', employeeId: 'e-1' } }, {}, ctx('t-1'))).toBe(true);
		expect(f({ ev: { tenantId: 't-1', employeeId: 'e-1' } }, { employeeId: 'e-1' }, ctx('t-1'))).toBe(true);
		expect(f({ ev: { tenantId: 't-1', employeeId: 'e-1' } }, { employeeId: 'e-2' }, ctx('t-1'))).toBe(false);
		expect(f({ ev: { tenantId: 't-2', employeeId: 'e-1' } }, {}, ctx('t-1'))).toBe(false);
		expect(f({ ev: { tenantId: 't-1', employeeId: 'e-1' } }, {}, ctx())).toBe(false);
	});
});
