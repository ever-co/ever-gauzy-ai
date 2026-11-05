import { NovuService } from './novu.service';
import { NovuWorkflows } from './novu.workflows';

// Mock the @novu/api SDK
jest.mock('@novu/api', () => ({
	Novu: jest.fn().mockImplementation(() => ({
		trigger: jest.fn().mockResolvedValue({}),
	})),
}));

describe('NovuService', () => {
	let service: NovuService;

	const mockEmployee = {
		id: 'emp-1',
		firstName: 'John',
		lastName: 'Doe',
		userId: 'user-1',
	};
	const mockJobPost = {
		id: 'job-1',
		title: 'Senior Developer',
		providerCode: 'upwork',
	};

	describe('when NOVU_API_KEY is NOT set', () => {
		beforeEach(() => {
			delete process.env.NOVU_API_KEY;
			service = new NovuService();
		});

		it('should create the service', () => {
			expect(service).toBeDefined();
		});

		it('should report as not enabled', () => {
			expect(service.isEnabled()).toBe(false);
		});

		it('should skip match alert when Novu is not configured', async () => {
			await expect(
				service.sendMatchAlert(mockEmployee, mockJobPost, 90, 'Great match')
			).resolves.toBeUndefined();
		});

		it('should skip application status when Novu is not configured', async () => {
			await expect(
				service.sendApplicationStatus(mockEmployee, {
					jobTitle: 'Dev',
					providerCode: 'linkedin',
					status: 'applied',
					applicationId: 'app-1',
					employeeId: 'emp-1',
				})
			).resolves.toBeUndefined();
		});

		it('should skip automation task complete when Novu is not configured', async () => {
			await expect(
				service.sendAutomationTaskComplete(mockEmployee, {
					taskId: 'task-1',
					commandType: 'apply_job',
					status: 'completed',
					employeeId: 'emp-1',
				})
			).resolves.toBeUndefined();
		});

		it('should skip daily digest when Novu is not configured', async () => {
			await expect(
				service.sendDailyDigest(mockEmployee, {
					employeeId: 'emp-1',
					newMatchCount: 5,
					applicationsSubmitted: 2,
					statusChanges: 1,
					topMatches: [],
				})
			).resolves.toBeUndefined();
		});
	});

	describe('when NOVU_API_KEY IS set', () => {
		let novuInstance: any;

		beforeEach(() => {
			process.env.NOVU_API_KEY = 'test-api-key';
			const { Novu } = require('@novu/api');
			novuInstance = { trigger: jest.fn().mockResolvedValue({}) };
			(Novu as jest.Mock).mockImplementation(() => novuInstance);
			service = new NovuService();
		});

		afterEach(() => {
			delete process.env.NOVU_API_KEY;
		});

		it('should report as enabled', () => {
			expect(service.isEnabled()).toBe(true);
		});

		// ── sendMatchAlert ──────────────────────────────────────────

		it('should send match alert with correct workflow and payload', async () => {
			await service.sendMatchAlert(mockEmployee, mockJobPost, 95, 'Excellent fit');

			expect(novuInstance.trigger).toHaveBeenCalledWith({
				workflowId: NovuWorkflows.NEW_JOB_MATCH,
				to: {
					subscriberId: 'user-1',
					firstName: 'John',
					lastName: 'Doe',
					email: undefined,
				},
				payload: {
					jobTitle: 'Senior Developer',
					matchScore: 95,
					explanation: 'Excellent fit',
					providerCode: 'upwork',
					jobPostId: 'job-1',
					employeeId: 'emp-1',
				},
			});
		});

		it('should use employee.id as subscriberId fallback when userId is absent', async () => {
			const employeeNoUserId = { id: 'emp-2', firstName: 'Jane' };
			await service.sendMatchAlert(employeeNoUserId as any, mockJobPost, 80, 'Good match');

			expect(novuInstance.trigger).toHaveBeenCalledWith(
				expect.objectContaining({
					to: expect.objectContaining({
						subscriberId: 'emp-2',
					}),
				})
			);
		});

		it('should default job title to "Unknown Job" when missing', async () => {
			await service.sendMatchAlert(mockEmployee, { id: 'job-2' }, 75, 'OK match');

			expect(novuInstance.trigger).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: expect.objectContaining({
						jobTitle: 'Unknown Job',
					}),
				})
			);
		});

		// ── sendApplicationStatus ───────────────────────────────────

		it('should send application status notification', async () => {
			await service.sendApplicationStatus(mockEmployee, {
				jobTitle: 'React Developer',
				providerCode: 'linkedin',
				status: 'shortlisted',
				applicationId: 'app-1',
				employeeId: 'emp-1',
				clientMessage: 'Looks promising!',
			});

			expect(novuInstance.trigger).toHaveBeenCalledWith({
				workflowId: NovuWorkflows.APPLICATION_STATUS,
				to: expect.objectContaining({ subscriberId: 'user-1' }),
				payload: expect.objectContaining({
					status: 'shortlisted',
					applicationId: 'app-1',
					clientMessage: 'Looks promising!',
				}),
			});
		});

		// ── sendAutomationTaskComplete ──────────────────────────────

		it('should send automation task complete notification', async () => {
			await service.sendAutomationTaskComplete(mockEmployee, {
				taskId: 'task-1',
				commandType: 'apply_job',
				status: 'completed',
				employeeId: 'emp-1',
				jobTitle: 'Full Stack Dev',
			});

			expect(novuInstance.trigger).toHaveBeenCalledWith({
				workflowId: NovuWorkflows.AUTOMATION_TASK_COMPLETE,
				to: expect.objectContaining({ subscriberId: 'user-1' }),
				payload: expect.objectContaining({
					taskId: 'task-1',
					commandType: 'apply_job',
					status: 'completed',
				}),
			});
		});

		it('should send automation task failure notification with error', async () => {
			await service.sendAutomationTaskComplete(mockEmployee, {
				taskId: 'task-2',
				commandType: 'apply_job',
				status: 'failed',
				employeeId: 'emp-1',
				errorMessage: 'Timeout waiting for page load',
			});

			expect(novuInstance.trigger).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: expect.objectContaining({
						status: 'failed',
						errorMessage: 'Timeout waiting for page load',
					}),
				})
			);
		});

		// ── sendDailyDigest ─────────────────────────────────────────

		it('should send daily digest notification', async () => {
			const employeeWithEmail = { ...mockEmployee, email: 'john@example.com' };
			await service.sendDailyDigest(employeeWithEmail, {
				employeeId: 'emp-1',
				newMatchCount: 12,
				applicationsSubmitted: 3,
				statusChanges: 2,
				topMatches: [
					{ jobTitle: 'React Dev', matchScore: 95, providerCode: 'upwork' },
					{ jobTitle: 'Node Dev', matchScore: 88, providerCode: 'linkedin' },
				],
			});

			expect(novuInstance.trigger).toHaveBeenCalledWith({
				workflowId: NovuWorkflows.DAILY_DIGEST,
				to: expect.objectContaining({
					subscriberId: 'user-1',
					email: 'john@example.com',
				}),
				payload: expect.objectContaining({
					newMatchCount: 12,
					topMatches: expect.arrayContaining([
						expect.objectContaining({ jobTitle: 'React Dev', matchScore: 95 }),
					]),
				}),
			});
		});

		// ── Error Handling ──────────────────────────────────────────

		it('should handle SDK errors gracefully without throwing', async () => {
			novuInstance.trigger.mockRejectedValueOnce(new Error('Network error'));

			await expect(
				service.sendMatchAlert(mockEmployee, mockJobPost, 92, 'Good match')
			).resolves.toBeUndefined();
		});

		it('should handle errors in all workflow methods gracefully', async () => {
			novuInstance.trigger.mockRejectedValue(new Error('Service unavailable'));

			await expect(
				service.sendApplicationStatus(mockEmployee, {
					jobTitle: 'Dev',
					providerCode: 'indeed',
					status: 'applied',
					applicationId: 'app-1',
					employeeId: 'emp-1',
				})
			).resolves.toBeUndefined();

			await expect(
				service.sendAutomationTaskComplete(mockEmployee, {
					taskId: 'task-1',
					commandType: 'apply_job',
					status: 'failed',
					employeeId: 'emp-1',
				})
			).resolves.toBeUndefined();
		});

		// ── Hardening: workflow ID correctness ─────────────────────────

		it('should use correct workflow IDs for each method', async () => {
			// Send all workflows
			await service.sendMatchAlert(mockEmployee, mockJobPost, 90, 'Match');
			await service.sendApplicationStatus(mockEmployee, {
				jobTitle: 'Dev',
				providerCode: 'upwork',
				status: 'applied',
				applicationId: 'app-1',
				employeeId: 'emp-1',
			});
			await service.sendAutomationTaskComplete(mockEmployee, {
				taskId: 'task-1',
				commandType: 'apply_job',
				status: 'completed',
				employeeId: 'emp-1',
			});
			await service.sendDailyDigest(mockEmployee, {
				employeeId: 'emp-1',
				newMatchCount: 3,
				applicationsSubmitted: 1,
				statusChanges: 0,
				topMatches: [],
			});

			// Extract all workflow IDs from trigger calls
			const workflowIds = novuInstance.trigger.mock.calls.map(
				(c: any[]) => c[0].workflowId
			);

			expect(workflowIds).toEqual([
				NovuWorkflows.NEW_JOB_MATCH,
				NovuWorkflows.APPLICATION_STATUS,
				NovuWorkflows.AUTOMATION_TASK_COMPLETE,
				NovuWorkflows.DAILY_DIGEST,
			]);
		});

		it('should default providerCode to "unknown" when missing from job post', async () => {
			const jobPostNoProvider = { id: 'job-2', title: 'Dev' };
			await service.sendMatchAlert(mockEmployee, jobPostNoProvider as any, 85, 'Decent');

			expect(novuInstance.trigger).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: expect.objectContaining({
						providerCode: 'unknown',
					}),
				})
			);
		});
	});
});
