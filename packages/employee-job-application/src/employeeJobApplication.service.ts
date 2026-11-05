import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommandBus, EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareCrudService } from '@packages/core/crud';
import { currentTenantWhere } from '@packages/core/context';
import { rowLockOption } from '@packages/core/persistence';
import { EmployeeJobApplication, EmployeeJobPost } from '@packages/entities';
import { EmployeeJobApplicationFinalizeDto } from '@packages/dto/employeeJobApplicationFinalize.dto';
import { GenerateProposalRequest } from '@packages/ai/generateProposalRequest';
import { AiService } from '@packages/ai/ai.service';
import { EmployeeJobApplicationCreateCommand } from './commands/employeeJobApplicationCreate.command';
import { EmployeeJobApplicationStatusChangedEvent } from './events/employeeJobApplicationStatusChanged.event';
import { applicationStatusChange } from './applicationStatus';
import { completeScreeningAnswers } from './screeningAnswers';
import { automationTaskBlockers, isKnownProviderId, SubmittedEmployeeJobApplication } from './automationTaskReadiness';

/** Inputs of a proposal generation that the caller has and the stored application may not (yet). */
export interface ProposalGenerationInput {
	proposalTemplate?: string | null;
	qa?: string | null;
}

@Injectable()
export class EmployeeJobApplicationService extends TenantAwareCrudService<EmployeeJobApplication> {
	private readonly logger = new Logger(EmployeeJobApplicationService.name);

	constructor(
		@InjectRepository(EmployeeJobApplication)
		readonly repo: Repository<EmployeeJobApplication>,

		@InjectRepository(EmployeeJobPost)
		readonly employeeJobPostRepo: Repository<EmployeeJobPost>,

		public readonly aiService: AiService,

		private readonly commandBus: CommandBus,

		private readonly eventBus: EventBus
	) {
		super(repo);
	}

	/**
	 * Create a job application from an EmployeeJobPost match (GraphQL `applyToJob`).
	 *
	 * Takes the same path as `POST /api/employee/job/application/process`: the application is
	 * stored through `EmployeeJobApplicationCreateCommand`, whose handler reuses the application
	 * already made for this match, generates the AI proposal + QA when it has none and publishes
	 * `EmployeeJobApplicationCreatedEvent`; the saga turns that into the `apply_job` automation task.
	 * An application the automation cannot act on (no proposal because the AI call failed, unanswered
	 * screening questions, ...) stays a draft without a task; `applicationStatus` lists why
	 * (`automationTaskBlockers`).
	 *
	 * @param employeeJobPostId - The matched EmployeeJobPost to apply for
	 * @returns The application with its proposal, ready to review
	 */
	async apply(employeeJobPostId: string): Promise<EmployeeJobApplication> {
		// Load the match with its relations
		const match = await this.employeeJobPostRepo.findOne({
			where: { id: employeeJobPostId, ...currentTenantWhere() },
			relations: { jobPost: true, employee: true },
		});

		if (!match) {
			throw new NotFoundException(`EmployeeJobPost ${employeeJobPostId} not found`);
		}

		if (!match.jobPost) {
			throw new NotFoundException(`JobPost not found for EmployeeJobPost ${employeeJobPostId}`);
		}

		// the match is ours, but its employeeId is written by clients: the employee must be ours too,
		// or the automation task would be queued for another tenant's employee
		if (!match.employee || match.employee.tenantId !== match.tenantId) {
			throw new ForbiddenException(`The employee of EmployeeJobPost ${employeeJobPostId} does not belong to this tenant`);
		}

		// Create the application record
		const application = new EmployeeJobApplication();
		application.employeeJobPostId = match.id;
		application.employeeId = match.employeeId;
		application.jobPostId = match.jobPostId;
		application.providerCode = match.providerCode;
		application.providerJobId = match.providerJobId;
		application.jobDateCreated = match.jobDateCreated;
		application.jobStatus = match.jobStatus;
		application.jobType = match.jobType;
		application.tenantId = match.tenantId;
		application.orgId = match.orgId;

		const created: SubmittedEmployeeJobApplication = await this.commandBus.execute(
			new EmployeeJobApplicationCreateCommand(application)
		);

		this.logger.log(
			created.automationTaskBlockers?.length
				? `Application ${created.id} for Employee ${match.employeeId} / Job ${match.jobPostId} kept as a draft: ${created.automationTaskBlockers.join('; ')}`
				: `Application ${created.id} submitted for Employee ${match.employeeId} / Job ${match.jobPostId}`
		);

		// Reload: the stored row with the generated proposal and its relations
		const stored = await this.repo.findOne({
			where: { id: created.id, ...currentTenantWhere() },
			relations: { jobPost: true, employeeJobPost: true },
		});
		if (!stored) {
			throw new NotFoundException(`EmployeeJobApplication ${created.id} not found`);
		}
		return stored;
	}

	/**
	 * Get a structured status view of a job application.
	 *
	 * @param id - EmployeeJobApplication id
	 * @returns Status summary with proposal readiness, timeline, and provider info
	 */
	async getApplicationStatus(id: string): Promise<{
		id: string;
		appliedStatus: string | null;
		appliedDate: Date | null;
		hasProposal: boolean;
		isProposalGeneratedByAI: boolean;
		isViewedByClient: boolean;
		providerCode: string;
		providerJobApplicationId: string | null;
		jobTitle: string | null;
		createdAt: Date;
		automationTaskBlockers: string[];
	}> {
		const app = await this.repo.findOne({
			where: { id, ...currentTenantWhere() },
			relations: { jobPost: true },
		});

		if (!app) {
			throw new NotFoundException(`EmployeeJobApplication ${id} not found`);
		}

		return {
			id: app.id,
			appliedStatus: app.appliedStatus ?? null,
			appliedDate: app.appliedDate ?? null,
			hasProposal: !!app.proposal,
			isProposalGeneratedByAI: app.isProposalGeneratedByAI ?? false,
			isViewedByClient: app.isViewedByClient ?? false,
			providerCode: app.providerCode,
			providerJobApplicationId: app.providerJobApplicationId ?? null,
			jobTitle: app.jobPost?.title ?? null,
			createdAt: (app as any).createdAt,
			// as the create command handler sees it: the job post names the platform and the job when the application does not
			automationTaskBlockers: automationTaskBlockers({
				...app,
				providerCode: app.providerCode || app.jobPost?.providerCode,
				providerJobId: isKnownProviderId(app.providerJobId) ? app.providerJobId : app.jobPost?.providerJobId,
			}),
		};
	}
	/*
	 * Finalize job application with given Id.
	 * Set appliedDate in EmployeeJobPost and EmployeeJobApplication.
	 * Set isApplied in EmployeeJobPost.
	 * Update value of providerJobApplicationId in EmployeeJobApplication in DB.
	 * When appliedStatus changes to a different notified status, the employee is notified once
	 * (EmployeeJobApplicationStatusChangedEvent; the bulk update is invisible to the subscriber).
	 */
	async finalize(
		id: string,
		finalizeDto: EmployeeJobApplicationFinalizeDto
	): Promise<void> {
		// The stored status is read under a row lock (where the database has row locks) in the same
		// transaction as the update, so of two concurrent finalize calls only one sees a given change.
		const existedEmployeeJobApplication = await this.repo.manager.transaction(async (manager) => {
			const existed = await manager.getRepository(EmployeeJobApplication).findOne({
				where: { id, ...currentTenantWhere() },
				...rowLockOption(manager),
			});

			if (!existed) {
				throw new NotFoundException(`EmployeeJobApplication ${id} not found`);
			}

			await manager.getRepository(EmployeeJobApplication).update({ id: id }, {
				appliedDate: finalizeDto.appliedDate,
				appliedStatus: finalizeDto.appliedStatus,
				providerJobApplicationId: finalizeDto.providerJobApplicationId,
			});

			// the match is updated within the tenant too: never touch a row of another tenant through a stale link
			await manager.getRepository(EmployeeJobPost).update({ id: existed.employeeJobPostId, ...currentTenantWhere() }, {
				appliedDate: finalizeDto.appliedDate,
				isApplied: true,
				appliedStatus: finalizeDto.appliedStatus,
			});

			return existed;
		});

		// published after the commit
		const status = applicationStatusChange(existedEmployeeJobApplication.appliedStatus, finalizeDto.appliedStatus);
		if (status) {
			this.eventBus.publish(
				new EmployeeJobApplicationStatusChangedEvent(id, status, existedEmployeeJobApplication.appliedStatus)
			);
		}
	}

	/**
	 * Generate proposal for the job application using AI and store it (`proposal`,
	 * `isProposalGeneratedByAI`, and the screening answers: the given or stored ones, with blank
	 * answers filled by the AI; see `completeScreeningAnswers()`).
	 * @param id existing EmployeeJobApplication id record
	 * @param input proposal template / QA to use instead of the stored ones (the values a caller
	 * submitted with the application; the stored ones are used when these are empty)
	 */
	async generateProposal(id: string, input: ProposalGenerationInput = {}): Promise<void> {
		const existedEmployeeJobApplication = await this.repo.findOne({
			where: { id, ...currentTenantWhere() },
			relations: { jobPost: true, employeeJobPost: true },
		});

		if (!existedEmployeeJobApplication) {
			throw new NotFoundException(`EmployeeJobApplication ${id} not found`);
		}

		const qa = input.qa || existedEmployeeJobApplication.qa;
		const generateProposalRequest: GenerateProposalRequest = {
			description: existedEmployeeJobApplication.jobPost.description,
			skills: existedEmployeeJobApplication.jobPost.skills,
			title: existedEmployeeJobApplication.jobPost.title,
			category: existedEmployeeJobApplication.jobPost.category,
			employeeTemplate: input.proposalTemplate || existedEmployeeJobApplication.proposalTemplate,
			qa,
		};

		this.logger.debug(`Generate Proposal Request: ${JSON.stringify(generateProposalRequest)}`);

		// Callers: the create command handler (the application flow, before the automation task is queued) and the
		// explicit (re)generation endpoints; the proposal is stored so the person reviews what will be sent.
		const generateProposalResponse = await this.aiService.generateProposal(
			generateProposalRequest
		);

		this.logger.debug(`Generate Proposal Response: ${JSON.stringify(generateProposalResponse)}`);

		const updateObj: any = {
			proposal: generateProposalResponse.proposal,
			isProposalGeneratedByAI: true,
		};

		// The caller's answers are kept and the AI fills the blank ones (all of them when the caller sent none),
		// so the stored application carries the QA its automation task is sent with.
		const completedQa = completeScreeningAnswers(qa, generateProposalResponse.qa);
		if (completedQa && completedQa !== existedEmployeeJobApplication.qa) {
			updateObj.qa = completedQa;
		}

		await this.repo.update({ id: existedEmployeeJobApplication.id }, updateObj);
	}
}

