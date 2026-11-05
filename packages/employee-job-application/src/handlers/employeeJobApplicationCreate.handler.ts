import { Logger, NotFoundException } from '@nestjs/common';
import { ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { EmployeeJobApplicationCreateCommand } from '../commands/employeeJobApplicationCreate.command';
import { EmployeeJobApplication } from '@packages/entities';
import { EmployeeJobApplicationCreatedEvent } from '../events/employeeJobApplicationCreated.event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeJobPostService } from '@packages/employeeJobPost/employeeJobPost.service';
import { EmployeeService } from '@packages/employee/employee.service';
import { JobPostService } from '@packages/jobPost/jobPost.service';
import { requireCurrentTenantId } from '@packages/core/context';
import { EmployeeJobApplicationService } from '../employeeJobApplication.service';
import { automationTaskBlockers, isKnownProviderId, SubmittedEmployeeJobApplication } from '../automationTaskReadiness';

/** What a submission sends with its automation task: stored on a reused application so both carry the same values. */
const SUBMITTED_FIELDS = ['proposal', 'isProposalGeneratedByAI', 'proposalTemplate', 'qa', 'rate', 'terms', 'attachments'] as const;

/** A value a submission actually gives: null and empty strings mean "not given". */
const given = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

@CommandHandler(EmployeeJobApplicationCreateCommand)
export class EmployeeJobApplicationCreateCommandHandler
	implements ICommandHandler<EmployeeJobApplicationCreateCommand>
{
	private readonly logger = new Logger(EmployeeJobApplicationCreateCommandHandler.name);

	constructor(
		@InjectRepository(EmployeeJobApplication)
		private readonly repo: Repository<EmployeeJobApplication>,
		private readonly employeeService: EmployeeService,
		private readonly employeeJobPostService: EmployeeJobPostService,
		private readonly jobPostService: JobPostService,
		private readonly eventBus: EventBus,
		private readonly employeeJobApplicationService: EmployeeJobApplicationService
	) {}

	/**
	 * Will create a new Employee Job Application record (or use the existing one of the same tenant,
	 * employee, job post and match), make sure it has a proposal, and trigger
	 * EmployeeJobApplicationCreatedEvent (the saga turns it into the automation task) when it has
	 * everything the automation needs; otherwise it stays a draft and `automationTaskBlockers` says why.
	 * Used by `POST /api/employee/job/application/process` and GraphQL `applyToJob`.
	 * @param command
	 * @returns
	 */
	async execute(
		command: EmployeeJobApplicationCreateCommand
	): Promise<SubmittedEmployeeJobApplication> {
		const { employeeJobApplication } = command;

		console.log(
			`EmployeeJobApplicationCreateCommandHandler executed with Employee Job Application details: ${JSON.stringify(
				command.employeeJobApplication
			)}`
		);

		const employeeId = employeeJobApplication.employeeId;
		const jobPostId = employeeJobApplication.jobPostId;
		const employeeJobPostId = employeeJobApplication.employeeJobPostId;
		// every lookup stays within the application's tenant (set by the callers to the authenticated one)
		const tenantId = employeeJobApplication.tenantId ?? requireCurrentTenantId();

		let createdEmployeeJobApplication: EmployeeJobApplication;

		// if we did not get id in the request, it means we may need to create a new record in DB (if it's not exists yet)
		if (!employeeJobApplication.id) {
			// If we don't have employeeJobApplication.id given in request,
			// we will anyway try to search for already existed record in DB using other parameters
			const existedEmployeeJobApplication = await this.repo.findOne({
				where: {
					employeeId: employeeId,
					jobPostId: jobPostId,
					employeeJobPostId: employeeJobPostId,
					tenantId,
				},
			});

			if (existedEmployeeJobApplication) {
				// we found existed record in DB, let's use it instead of create a new one
				createdEmployeeJobApplication = existedEmployeeJobApplication;
			} else {
				// we can't find the record in DB, so we will create a new one
				createdEmployeeJobApplication = await this.repo.save(
					employeeJobApplication
				);
			}
		} else {
			// If we have id field, it means we are using the existing record, not create a new one. The id may
			// come from the request body: it must be this tenant's application for the same employee, job post
			// and match, or another application would be overwritten and sent.
			const stored = await this.repo.findOne({
				where: { id: employeeJobApplication.id, tenantId, employeeId, jobPostId, employeeJobPostId },
			});
			if (!stored) {
				throw new NotFoundException(
					`EmployeeJobApplication ${employeeJobApplication.id} not found for this employee and job post`
				);
			}
			createdEmployeeJobApplication = employeeJobApplication;
			await this.storeSubmittedFields(employeeJobApplication, tenantId);
			this.completeFromStored(employeeJobApplication, stored);
		}

		createdEmployeeJobApplication.employeeId = employeeId;
		createdEmployeeJobApplication.jobPostId = jobPostId;
		createdEmployeeJobApplication.employeeJobPostId = employeeJobPostId;

		const employee = await this.employeeService.findOne({
			where: { id: createdEmployeeJobApplication.employeeId },
		});

		createdEmployeeJobApplication.employee = employee;

		const jobPost = await this.jobPostService.findOne({
			where: { id: createdEmployeeJobApplication.jobPostId },
		});

		createdEmployeeJobApplication.jobPost = jobPost;
		// the platform and the job the automation opens: the job post's when the application does not name them
		if (!isKnownProviderId(createdEmployeeJobApplication.providerJobId) && jobPost?.providerJobId) {
			createdEmployeeJobApplication.providerJobId = jobPost.providerJobId;
		}
		if (!createdEmployeeJobApplication.providerCode && jobPost?.providerCode) {
			createdEmployeeJobApplication.providerCode = jobPost.providerCode;
		}

		const employeeJobPost = await this.employeeJobPostService.findOne({
			where: { id: createdEmployeeJobApplication.employeeJobPostId },
		});

		createdEmployeeJobApplication.employeeJobPost = employeeJobPost;

		await this.ensureProposal(createdEmployeeJobApplication, tenantId);

		console.log(
			`EmployeeJobApplicationCreateCommandHandler created Employee Job Application: ${JSON.stringify(
				createdEmployeeJobApplication
			)}`
		);

		// an automation task only for an application the automation can act on; otherwise it stays a draft
		const blockers = automationTaskBlockers(createdEmployeeJobApplication);
		if (!employee) {
			blockers.push('the employee no longer exists');
		}
		const submitted = Object.assign(createdEmployeeJobApplication, { automationTaskBlockers: blockers });
		if (blockers.length) {
			this.logger.warn(
				`Application ${createdEmployeeJobApplication.id} kept as a draft, no automation task: ${blockers.join('; ')}`
			);
			return submitted;
		}

		this.eventBus.publish(
			new EmployeeJobApplicationCreatedEvent(
				createdEmployeeJobApplication
			)
		);

		return submitted;
	}

	/**
	 * The one place the application flow generates a proposal, before the event is published: an
	 * application submitted without one gets the proposal already stored for it (a draft prepared by
	 * `pre-process`) or, when there is none, an AI proposal that is stored on the application. The
	 * saga copies it into the automation task as is, so the proposal is generated once and the
	 * application and its task carry the same text. A failed AI call is logged and the flow goes on
	 * without a proposal, as before.
	 */
	private async ensureProposal(application: EmployeeJobApplication, tenantId: string): Promise<void> {
		if (application.proposal || !application.id) {
			return;
		}
		const where = { id: application.id, tenantId };
		const stored = await this.repo.findOne({ where });
		if (stored?.proposal) {
			application.proposal = stored.proposal;
			application.isProposalGeneratedByAI = stored.isProposalGeneratedByAI;
			application.qa = application.qa || stored.qa;
			return;
		}
		try {
			await this.employeeJobApplicationService.generateProposal(application.id, {
				proposalTemplate: application.proposalTemplate,
				qa: application.qa,
			});
		} catch (error) {
			this.logger.warn(
				`AI proposal generation failed for application ${application.id}: ${error instanceof Error ? error.message : String(error)}. Proceeding without proposal.`
			);
			return;
		}
		// the stored proposal and screening answers (the submitted ones completed by the AI)
		const generated = await this.repo.findOne({ where });
		if (generated?.proposal) {
			application.proposal = generated.proposal;
			application.isProposalGeneratedByAI = generated.isProposalGeneratedByAI;
			application.qa = generated.qa ?? application.qa;
		}
	}

	/**
	 * A submission for an application that already exists (a `pre-process` draft, found by the
	 * controller) stores what it sends: the automation task is built from the submitted values, and
	 * the application keeps the same proposal, answers, rate and terms. Fields left out, null or empty
	 * are kept as stored: an empty proposal means "none given", and the draft's proposal is then reused.
	 */
	private async storeSubmittedFields(application: EmployeeJobApplication, tenantId: string): Promise<void> {
		const submitted = Object.fromEntries(
			SUBMITTED_FIELDS.filter((field) => given(application[field]))
				// the provenance flag describes the proposal: it is stored only with a replacement proposal
				.filter((field) => field !== 'isProposalGeneratedByAI' || given(application.proposal))
				.map((field) => [field, application[field]])
		) as Partial<EmployeeJobApplication>;
		if (Object.keys(submitted).length) {
			await this.repo.update({ id: application.id, tenantId }, submitted);
		}
	}

	/**
	 * The task is built from the whole application: what this submission left out is taken from the
	 * stored application. The provenance flag follows storeSubmittedFields(): the one supplied with a
	 * proposal (which was stored), else the one that remains stored.
	 */
	private completeFromStored(application: EmployeeJobApplication, stored: EmployeeJobApplication): void {
		const flagStored = given(application.proposal) && given(application.isProposalGeneratedByAI);
		for (const field of SUBMITTED_FIELDS) {
			if (field === 'isProposalGeneratedByAI') {
				if (!flagStored) {
					application.isProposalGeneratedByAI = stored.isProposalGeneratedByAI;
				}
			} else if (!given(application[field])) {
				Object.assign(application, { [field]: stored[field] });
			}
		}
		for (const field of ['providerCode', 'providerJobId', 'jobType', 'jobStatus', 'jobDateCreated'] as const) {
			if (!given(application[field])) {
				Object.assign(application, { [field]: stored[field] });
			}
		}
	}
}
