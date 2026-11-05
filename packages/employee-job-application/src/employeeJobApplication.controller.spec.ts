import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@packages/core/context/request-context';
import { EmployeeJobApplicationController } from './employeeJobApplication.controller';

/**
 * Tenant isolation of the REST `process` / `pre-process` paths used by the Ever Gauzy integration
 * plugin: the employee must be ours, the match must be this employee's, and what we save carries
 * only the authenticated tenant.
 */
describe('EmployeeJobApplicationController (tenant isolation)', () => {
	const jobPostRepository = { findOne: jest.fn(), save: jest.fn() };
	const employeeJobPostRepository = { findOne: jest.fn(), save: jest.fn() };
	const employeeJobApplicationRepository = { findOne: jest.fn() };
	const employeeRepository = { exists: jest.fn() };
	const commandBus = { execute: jest.fn() };
	const aiService = { generateProposal: jest.fn() };
	const controller = new EmployeeJobApplicationController(
		{} as any,
		aiService as any,
		commandBus as any,
		jobPostRepository as any,
		employeeJobPostRepository as any,
		employeeJobApplicationRepository as any,
		employeeRepository as any
	);
	const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
		RequestContext.run(new RequestContext({ tenant: { id: tenantId } } as any, {} as any), fn);
	const baseDto = (): any => ({
		employeeId: 'emp-1',
		providerCode: 'upwork',
		providerJobId: 'job-1',
		jobPost: { providerJobId: 'job-1', title: 'T', description: 'D' },
		proposal: 'already written',
	});

	beforeEach(() => {
		jest.resetAllMocks();
		jobPostRepository.findOne.mockResolvedValue({ id: 'jp-1' });
		employeeJobApplicationRepository.findOne.mockResolvedValue(null);
		commandBus.execute.mockImplementation(async (command: { input?: { id?: string } }) => ({ id: command?.input?.id ?? 'app-1' }));
		console.log = jest.fn();
	});

	it('refuses an employee of another tenant (top-level and nested reference)', async () => {
		employeeRepository.exists.mockResolvedValue(false);
		await expect(asTenant('t-1', () => controller.Process({} as any, baseDto()))).rejects.toBeInstanceOf(ForbiddenException);
		const nested = { ...baseDto(), employeeId: undefined, employeeJobPost: { employeeId: 'emp-foreign' } };
		await expect(asTenant('t-1', () => controller.PreProcess({} as any, nested))).rejects.toBeInstanceOf(ForbiddenException);
		expect(employeeRepository.exists).toHaveBeenCalledWith({ where: { id: 'emp-foreign', tenantId: 't-1' } });
		expect(employeeJobPostRepository.save).not.toHaveBeenCalled();
	});

	it('a match looked up by id must belong to the tenant and to the same employee', async () => {
		employeeRepository.exists.mockResolvedValue(true);
		employeeJobPostRepository.findOne.mockResolvedValue(null);
		const dto = { ...baseDto(), employeeJobPostId: 'ejp-other', employeeJobPost: { id: 'ejp-other' } };
		await expect(asTenant('t-1', () => controller.Process({} as any, dto))).rejects.toBeInstanceOf(NotFoundException);
		expect(employeeJobPostRepository.findOne).toHaveBeenCalledWith({ where: { id: 'ejp-other', employeeId: 'emp-1', tenantId: 't-1' } });
		expect(employeeJobPostRepository.save).not.toHaveBeenCalled();
	});

	it('a new match carries only the authenticated tenant and the validated employee', async () => {
		employeeRepository.exists.mockResolvedValue(true);
		employeeJobPostRepository.findOne.mockResolvedValue(null);
		employeeJobPostRepository.save.mockImplementation(async (row: object) => ({ ...row, id: 'ejp-new' }));
		const dto = {
			...baseDto(),
			employeeJobPost: {
				id: 'ejp-foreign',
				employeeId: 'emp-foreign',
				tenantId: 't-2',
				tenant: { id: 't-2' },
				org: { id: 'o-2' },
				employee: { id: 'emp-foreign', tenantId: 't-2' },
				providerCode: 'upwork',
			},
		};
		const result = await asTenant('t-1', () => controller.Process({} as any, dto));
		const saved = employeeJobPostRepository.save.mock.calls[0][0];
		expect(saved).toMatchObject({ employeeId: 'emp-1', tenantId: 't-1', jobPostId: 'jp-1', providerCode: 'upwork' });
		expect(saved).not.toHaveProperty('id');
		expect(saved).not.toHaveProperty('tenant');
		expect(saved).not.toHaveProperty('org');
		expect(saved).not.toHaveProperty('employee');
		expect(result).toMatchObject({ employeeId: 'emp-1', employeeJobPostId: 'ejp-new', tenantId: 't-1' });
	});
});
