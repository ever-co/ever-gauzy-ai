import { Injectable, Logger } from '@nestjs/common';
import { ICommand, ofType, Saga } from '@nestjs/cqrs';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { JobPostCreatedEvent } from '@packages/jobPost/events/jobPostCreated.event';
import { JobPostUpdatedEvent } from '@packages/jobPost/events/jobPostUpdated.event';
import { MatchJobPostsToEmployeesCommand } from '@packages/employeeJobPost/commands/matchJobPostsToEmployees.command';
import { EmployeeJobApplicationCreatedEvent } from '@packages/employeeJobApplication/events/employeeJobApplicationCreated.event';
import { AutomationTaskCreateCommand } from '@packages/automationTask/commands/automationTaskCreate.command';
import { AutomationTask, Employee } from '@packages/entities';

@Injectable()
export class AppSagas {
	private readonly logger = new Logger(AppSagas.name);

	// when new jobs found in some source (e.g. via Ever Jobs API), let's match them to employees
	// JobPostCreatedEvent => MatchJobPostsToEmployeesCommand
	@Saga()
	matchJobsToEmployees = (events$: Observable<any>): Observable<ICommand> => {
		return events$.pipe(
			ofType(JobPostCreatedEvent),
			map((event) => {
				return new MatchJobPostsToEmployeesCommand(event.jobPosts);
			}),
		);
	};

	// posts that were already stored (found again, or re-offered by the source-db provider) are
	// re-matched against the employees whose criteria or profile changed since
	// JobPostUpdatedEvent => MatchJobPostsToEmployeesCommand({ existing: true })
	@Saga()
	rematchJobsToEmployees = (events$: Observable<any>): Observable<ICommand> => {
		return events$.pipe(
			ofType(JobPostUpdatedEvent),
			map((event) => new MatchJobPostsToEmployeesCommand(event.jobPosts, { existing: true })),
		);
	};

	// EmployeeJobApplicationCreatedEvent => AutomationTaskCreateCommand (one task per event)
	@Saga()
	createAutomationTask = (events$: Observable<any>): Observable<ICommand> => {
		return events$.pipe(
			ofType(EmployeeJobApplicationCreatedEvent),
			map((event) => this.buildAutomationTaskCommand(event)),
			filter((command): command is ICommand => !!command),
		);
	};

	/**
	 * Build the AutomationTaskCreateCommand from an EmployeeJobApplicationCreatedEvent.
	 * The proposal is the application's own: the create command handler generated and stored it
	 * before publishing the event when the application had none, so nothing is generated here.
	 */
	private buildAutomationTaskCommand(
		event: EmployeeJobApplicationCreatedEvent,
	): ICommand | undefined {
		try {
			this.logger.log(
				`Saga executing for creating Automation Task. employeeJobApplicationId=${event.employeeJobApplication?.id}, providerCode=${event.employeeJobApplication?.providerCode}`,
			);

			const employeeJobApplication = event.employeeJobApplication;
			const employee: Employee = employeeJobApplication.employee;

			// Build the command payload — all task-specific details go here as serialized JSON
			const commandPayload: any = {
				commandType: 'apply_job',
				providerCode: employeeJobApplication.providerCode,
				providerJobId: employeeJobApplication.providerJobId,
				rate: employeeJobApplication.rate,
				terms: employeeJobApplication.terms,
				attachments: employeeJobApplication.attachments,

				employeeId: employeeJobApplication.employeeId,
				employeeFirstName: employee?.firstName,
				employeeLastName: employee?.lastName,

				// Job-specific fields (stored in command JSON, not on the entity)
				jobPostId: employeeJobApplication.jobPostId,
				jobTitle: employeeJobApplication.jobPost?.title,
				jobType: employeeJobApplication.jobType,
				jobStatus: employeeJobApplication.jobStatus,
				employeeJobApplicationId: employeeJobApplication.id,
				employeeJobPostId: employeeJobApplication.employeeJobPostId,
				proposal: employeeJobApplication.proposal,
				isProposalGeneratedByAI: employeeJobApplication.isProposalGeneratedByAI,
				proposalTemplate: employeeJobApplication.proposalTemplate,
				qa: employeeJobApplication.qa,
			};

			const automationTask: AutomationTask = {
				isBroadcast: false,
				tenantId: employee.tenantId,
				orgId: employee.orgId,
				employee: employee,
				isActive: true,
				isArchived: false,
				employeeId: employeeJobApplication.employeeId,
				status: 'open',
				commandType: 'apply_job',
				command: JSON.stringify(commandPayload),
			};

			this.logger.log(`AutomationTask created for provider=${employeeJobApplication.providerCode}, jobPostId=${employeeJobApplication.jobPostId}`);

			return new AutomationTaskCreateCommand(automationTask);
		} catch (error) {
			this.logger.error(
				`Error creating AutomationTask: ${error}`,
				error instanceof Error ? error.stack : undefined,
			);
			return undefined;
		}
	}
}
