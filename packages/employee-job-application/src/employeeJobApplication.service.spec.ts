// Every scoped lookup takes the tenant from the request context: pin it for the specs.
jest.mock('@packages/core/context', () => ({
	currentTenantWhere: () => ({ tenantId: 'tenant-1' }),
	requireCurrentTenantId: () => 'tenant-1',
	resolveTenantId: (requested?: string) => {
		if (requested && requested !== 'tenant-1') throw new Error('tenantId does not match the authenticated tenant');
		return 'tenant-1';
	},
	RequestContext: { currentTenantId: () => 'tenant-1' },
}));
// tenant-scope mock above
// Mock langfuse to prevent ESM dynamic import errors in Jest
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({
		getPrompt: jest.fn(),
		shutdown: jest.fn(),
	})),
}));

jest.mock('langfuse-core', () => ({
	LangfuseMedia: jest.fn(),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmployeeJobApplicationService } from './employeeJobApplication.service';
import { EmployeeJobApplication, EmployeeJobPost } from '@packages/entities';
import { EmployeeJobApplicationCreateCommand } from './commands/employeeJobApplicationCreate.command';
import { EmployeeJobApplicationStatusChangedEvent } from './events/employeeJobApplicationStatusChanged.event';

describe('EmployeeJobApplicationService', () => {
	let service: EmployeeJobApplicationService;
	let mockRepo: any;
	let mockEjpRepo: any;
	let mockAiService: any;
	let commandBus: { execute: jest.Mock };
	let eventBus: { publish: jest.Mock };

	beforeEach(() => {
		mockRepo = {
			findOne: jest.fn(),
			save: jest.fn(),
			update: jest.fn(),
			metadata: { columns: [], relations: [], connection: { options: { type: '' } }, target: EmployeeJobApplication },
		};
		mockEjpRepo = {
			findOne: jest.fn(),
			update: jest.fn(),
			metadata: { columns: [], relations: [], connection: { options: { type: '' } }, target: EmployeeJobPost },
		};
		// finalize() reads and writes in one transaction: hand it the same repository mocks
		const txManager = {
			dataSource: { options: { type: 'postgres' } },
			getRepository: (target: unknown) => (target === EmployeeJobApplication ? mockRepo : mockEjpRepo),
		};
		mockRepo.manager = { transaction: jest.fn((work: (manager: unknown) => Promise<unknown>) => work(txManager)) };
		mockAiService = {
			generateProposal: jest.fn().mockResolvedValue({
				proposal: 'AI-generated proposal text',
				qa: '[{"q":"What is your availability?","a":"Full time"}]',
			}),
		};

		commandBus = { execute: jest.fn() };
		eventBus = { publish: jest.fn() };

		// Create service instance by bypassing DI
		service = Object.create(EmployeeJobApplicationService.prototype);
		Object.assign(service, {
			repo: mockRepo,
			employeeJobPostRepo: mockEjpRepo,
			aiService: mockAiService,
			commandBus,
			eventBus,
			logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
		});
	});

	describe('apply()', () => {
		const mockMatch = {
			id: 'ejp-1',
			employeeId: 'emp-1',
			jobPostId: 'job-1',
			providerCode: 'upwork',
			providerJobId: 'prov-1',
			jobDateCreated: new Date(),
			jobStatus: 'Open',
			jobType: 'Hourly',
			tenantId: 'tenant-1',
			orgId: 'org-1',
			jobPost: { id: 'job-1', description: 'Full stack dev', title: 'Dev', skills: 'Node.js', category: 'Web' },
			employee: { id: 'emp-1', firstName: 'John', tenantId: 'tenant-1' },
		};

		it('submits the application through the create command and returns the stored row with its proposal', async () => {
			mockEjpRepo.findOne.mockResolvedValue(mockMatch);
			commandBus.execute.mockResolvedValue({ id: 'app-1' });
			const stored = { id: 'app-1', proposal: 'AI-generated proposal text', jobPost: mockMatch.jobPost, employeeJobPost: { id: 'ejp-1' } };
			mockRepo.findOne.mockResolvedValue(stored);

			const result = await service.apply('ejp-1');

			expect(mockEjpRepo.findOne).toHaveBeenCalledWith({
				where: { id: 'ejp-1', tenantId: 'tenant-1' },
				relations: { jobPost: true, employee: true },
			});
			// one command (handler: proposal + event, saga: automation task); nothing saved or generated here
			expect(commandBus.execute).toHaveBeenCalledTimes(1);
			const [command] = commandBus.execute.mock.calls[0];
			expect(command).toBeInstanceOf(EmployeeJobApplicationCreateCommand);
			expect(command.employeeJobApplication).toMatchObject({
				employeeJobPostId: 'ejp-1',
				employeeId: 'emp-1',
				jobPostId: 'job-1',
				providerCode: 'upwork',
				providerJobId: 'prov-1',
				tenantId: 'tenant-1',
				orgId: 'org-1',
			});
			expect(mockRepo.save).not.toHaveBeenCalled();
			expect(mockAiService.generateProposal).not.toHaveBeenCalled();
			expect(mockRepo.findOne).toHaveBeenCalledWith({
				where: { id: 'app-1', tenantId: 'tenant-1' },
				relations: { jobPost: true, employeeJobPost: true },
			});
			expect(result).toBe(stored);
		});

		it('should throw NotFoundException if EmployeeJobPost not found', async () => {
			mockEjpRepo.findOne.mockResolvedValue(null);

			await expect(service.apply('nonexistent'))
				.rejects.toThrow(NotFoundException);
		});

		it('should throw NotFoundException if JobPost is missing', async () => {
			mockEjpRepo.findOne.mockResolvedValue({ id: 'ejp-1', jobPost: null });

			await expect(service.apply('ejp-1'))
				.rejects.toThrow(NotFoundException);
		});

		it('refuses a match whose employee belongs to another tenant (nothing is submitted)', async () => {
			mockEjpRepo.findOne.mockResolvedValue({ ...mockMatch, employee: { id: 'emp-x', tenantId: 'tenant-2' } });

			await expect(service.apply('ejp-1')).rejects.toThrow(ForbiddenException);
			expect(commandBus.execute).not.toHaveBeenCalled();
		});

		it('never returns an application it cannot read back within the tenant', async () => {
			mockEjpRepo.findOne.mockResolvedValue(mockMatch);
			commandBus.execute.mockResolvedValue({ id: 'app-1', proposal: 'not ours' });
			mockRepo.findOne.mockResolvedValue(null);

			await expect(service.apply('ejp-1')).rejects.toThrow(NotFoundException);
		});
	});

	describe('finalize()', () => {
		it('should update application and job post', async () => {
			const existingApp = { id: 'app-1', employeeJobPostId: 'ejp-1' };
			mockRepo.findOne.mockResolvedValue(existingApp);

			await service.finalize('app-1', {
				appliedDate: new Date('2024-01-01'),
				appliedStatus: 'succeed',
				providerJobApplicationId: 'prov-app-1',
			});

			// the stored status is read under a row lock, in the transaction of the update
			expect(mockRepo.manager.transaction).toHaveBeenCalledTimes(1);
			expect(mockRepo.findOne).toHaveBeenCalledWith({
				where: { id: 'app-1', tenantId: 'tenant-1' },
				lock: { mode: 'pessimistic_write' },
			});
			expect(mockRepo.update).toHaveBeenCalledWith(
				{ id: 'app-1' },
				expect.objectContaining({ appliedStatus: 'succeed' })
			);
			expect(mockEjpRepo.update).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'ejp-1', tenantId: expect.any(String) }), // scoped to the tenant as well
				expect.objectContaining({ isApplied: true })
			);
			// the status changed (none -> succeed = applied): the employee is notified once
			expect(eventBus.publish).toHaveBeenCalledTimes(1);
			expect(eventBus.publish).toHaveBeenCalledWith(new EmployeeJobApplicationStatusChangedEvent('app-1', 'applied', undefined));
		});

		it('does not notify when the status does not really change', async () => {
			mockRepo.findOne.mockResolvedValue({ id: 'app-1', employeeJobPostId: 'ejp-1', appliedStatus: 'applied' });

			await service.finalize('app-1', { appliedDate: new Date(), appliedStatus: 'succeed', providerJobApplicationId: 'x' });
			await service.finalize('app-1', { appliedDate: new Date(), providerJobApplicationId: 'x' });
			await service.finalize('app-1', { appliedDate: new Date(), appliedStatus: 'failed', providerJobApplicationId: 'x' });

			expect(eventBus.publish).not.toHaveBeenCalled();
		});

		it('should throw NotFoundException if application not found', async () => {
			mockRepo.findOne.mockResolvedValue(null);

			await expect(
				service.finalize('nonexistent', {
					appliedDate: new Date(),
					appliedStatus: 'succeed',
					providerJobApplicationId: 'x',
				})
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('generateProposal()', () => {
		it('should call AI service and update the application', async () => {
			const existingApp = {
				id: 'app-1',
				qa: null,
				proposalTemplate: 'My template',
				jobPost: { description: 'Build API', title: 'API Dev', skills: 'Node', category: 'Backend' },
				employeeJobPost: { id: 'ejp-1' },
			};
			mockRepo.findOne.mockResolvedValue(existingApp);

			await service.generateProposal('app-1');

			expect(mockAiService.generateProposal).toHaveBeenCalledWith(
				expect.objectContaining({
					description: 'Build API',
					title: 'API Dev',
					employeeTemplate: 'My template',
				})
			);
			expect(mockRepo.update).toHaveBeenCalledWith(
				{ id: 'app-1' },
				expect.objectContaining({
					proposal: 'AI-generated proposal text',
					isProposalGeneratedByAI: true,
					qa: '[{"q":"What is your availability?","a":"Full time"}]',
				})
			);
		});

		it('should NOT overwrite QA if client already provided it', async () => {
			const existingApp = {
				id: 'app-1',
				qa: '[{"q":"Custom Q","a":"Custom A"}]',
				proposalTemplate: null,
				jobPost: { description: 'Build API', title: 'API Dev', skills: 'Node', category: 'Backend' },
				employeeJobPost: { id: 'ejp-1' },
			};
			mockRepo.findOne.mockResolvedValue(existingApp);

			await service.generateProposal('app-1');

			expect(mockRepo.update).toHaveBeenCalledWith(
				{ id: 'app-1' },
				{
					proposal: 'AI-generated proposal text',
					isProposalGeneratedByAI: true,
				}
			);
		});

		it('uses the template and QA the caller submitted over the stored ones', async () => {
			mockRepo.findOne.mockResolvedValue({
				id: 'app-1',
				qa: null,
				proposalTemplate: 'Stored template',
				jobPost: { description: 'Build API', title: 'API Dev', skills: 'Node', category: 'Backend' },
			});

			await service.generateProposal('app-1', { proposalTemplate: 'Submitted template', qa: '[{"q":"Q","a":"A"}]' });

			expect(mockAiService.generateProposal).toHaveBeenCalledWith(
				expect.objectContaining({ employeeTemplate: 'Submitted template', qa: '[{"q":"Q","a":"A"}]' })
			);
			// the caller's answered QA is kept (and stored): the AI answers are not stored over it
			expect(mockRepo.update).toHaveBeenCalledWith(
				{ id: 'app-1' },
				{ proposal: 'AI-generated proposal text', isProposalGeneratedByAI: true, qa: '[{"q":"Q","a":"A"}]' }
			);
		});

		it('fills the answers the caller left blank with the AI ones, in the caller\'s shape', async () => {
			mockRepo.findOne.mockResolvedValue({
				id: 'app-1',
				qa: '[{"q":"Availability?","a":""},{"q":"Rate?","a":"50"}]',
				jobPost: { description: 'Build API', title: 'API Dev', skills: 'Node', category: 'Backend' },
			});
			mockAiService.generateProposal.mockResolvedValue({
				proposal: 'AI-generated proposal text',
				qa: '[{"question":"Availability?","answer":"Full time"},{"question":"Rate?","answer":"40"}]',
			});

			await service.generateProposal('app-1');

			expect(mockRepo.update).toHaveBeenCalledWith(
				{ id: 'app-1' },
				expect.objectContaining({ qa: '[{"q":"Availability?","a":"Full time"},{"q":"Rate?","a":"50"}]' })
			);
		});

		it('should throw NotFoundException if application not found', async () => {
			mockRepo.findOne.mockResolvedValue(null);

			await expect(service.generateProposal('nonexistent'))
				.rejects.toThrow(NotFoundException);
		});
	});

	describe('getApplicationStatus()', () => {
		it('should return structured status for an existing application', async () => {
			mockRepo.findOne.mockResolvedValue({
				id: 'app-1',
				appliedStatus: 'succeed',
				appliedDate: new Date('2024-01-15'),
				proposal: 'My proposal text',
				isProposalGeneratedByAI: true,
				isViewedByClient: false,
				providerCode: 'upwork',
				providerJobApplicationId: 'prov-app-1',
				jobPost: { title: 'Senior Developer', providerJobId: '~01senior' },
				createdAt: new Date('2024-01-10'),
			});

			const status = await service.getApplicationStatus('app-1');

			expect(status).toEqual({
				id: 'app-1',
				appliedStatus: 'succeed',
				appliedDate: new Date('2024-01-15'),
				hasProposal: true,
				isProposalGeneratedByAI: true,
				isViewedByClient: false,
				providerCode: 'upwork',
				providerJobApplicationId: 'prov-app-1',
				jobTitle: 'Senior Developer',
				createdAt: new Date('2024-01-10'),
				automationTaskBlockers: [], // proposal present, the job post names the job
			});
		});

		it('should throw NotFoundException if application not found', async () => {
			mockRepo.findOne.mockResolvedValue(null);

			await expect(service.getApplicationStatus('nonexistent'))
				.rejects.toThrow(NotFoundException);
		});
	});
});
