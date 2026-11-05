import { currentTenantWhere, requireCurrentTenantId } from '@packages/core/context';
import { BadRequestException, Body, Controller, ForbiddenException, Param, Post, UseInterceptors, NotFoundException } from '@nestjs/common';
import {
	Crud,
	CrudController,
	CrudRequest,
	CrudRequestInterceptor,
	ParsedBody,
	ParsedRequest,
} from '@dataui/crud';
import { Employee, EmployeeJobApplication, EmployeeJobPost, JobPost } from '@packages/entities';
import { EmployeeJobApplicationFinalizeDto } from '@packages/dto/employeeJobApplicationFinalize.dto';
import { EmployeeJobApplicationService } from './employeeJobApplication.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AiService } from '@packages/ai/ai.service';
import { GenerateProposalRequest } from '@packages/ai/generateProposalRequest';
import { CommandBus } from '@nestjs/cqrs';
import { EmployeeJobApplicationCreateCommand } from './commands/employeeJobApplicationCreate.command';
import { EmployeeJobApplicationDTO } from '@packages/dto/employeeJobApplication.dto';
import { SubmittedEmployeeJobApplication } from './automationTaskReadiness';

/** The `/process` response: the application, plus whether its automation task was queued and, if not, why. */
export type ProcessedEmployeeJobApplication = EmployeeJobApplication & {
	automationTaskQueued: boolean;
	automationTaskBlockers: string[];
};

@Crud({
	model: {
		type: EmployeeJobApplication,
	},
	params: {
		id: {
			field: 'id',
			primary: true,
			type: 'uuid',
		},
	},
	dto: {
		create: EmployeeJobApplicationDTO,
		update: EmployeeJobApplicationDTO,
		replace: EmployeeJobApplicationDTO
	}
})
@Controller('api/employee/job/application')
export class EmployeeJobApplicationController implements CrudController<EmployeeJobApplication> {

	constructor(
		public readonly service: EmployeeJobApplicationService,
		public readonly aiService: AiService,
		private readonly commandBus: CommandBus,
		@InjectRepository(JobPost)
		public readonly jobPostRepository: Repository<JobPost>,
		@InjectRepository(EmployeeJobPost)
		public readonly employeeJobPostRepository: Repository<EmployeeJobPost>,
		@InjectRepository(EmployeeJobApplication)
		public readonly employeeJobApplicationRepository: Repository<EmployeeJobApplication>,
		@InjectRepository(Employee)
		public readonly employeeRepository: Repository<Employee>
	) { }

	/**
	 * The employee an application refers to (top-level `employeeId` or the nested match's) must
	 * belong to the caller's tenant; otherwise a caller could create matches and applications for
	 * another tenant's employee, which that tenant's scoped lookups would then load and act on.
	 */
	private async assertOwnedEmployee(employeeId?: string | null): Promise<string> {
		if (!employeeId) {
			throw new BadRequestException('employeeId is required');
		}
		const owned = await this.employeeRepository.exists({ where: { id: employeeId, ...currentTenantWhere() } });
		if (!owned) {
			throw new ForbiddenException(`Employee ${employeeId} does not belong to this tenant`);
		}
		return employeeId;
	}

	/**
	 * A match written by these endpoints is owned by the authenticated tenant and the validated
	 * employee only. The nested `id` would update a foreign row, and nested `tenant` / `org` /
	 * `employee` relations supplied by the client would override the scalar ids when TypeORM saves.
	 */
	private pinToCaller(employeeJobPost: EmployeeJobPost, employeeId: string): void {
		const row = employeeJobPost as Partial<EmployeeJobPost>;
		delete row.id;
		delete row.tenant;
		delete row.org;
		delete row.employee;
		employeeJobPost.employeeId = employeeId;
		employeeJobPost.tenantId = requireCurrentTenantId();
	}

	get base(): CrudController<EmployeeJobApplication> {
		return this;
	}

	/*
	 * Generate proposal for job application with given Id.
	 * This method works asynchronously, so it will return immediately and will not wait for the proposal to be generated.
	 * Client will have to call endpoint `api/employee/job/application` with EmployeeJobApplication Id to get the latest
	 * status of the job application. When proposal is generated, the value of `isProposalGeneratedByAI` will be set to `true`.
	 */
	@Post('generate-proposal/:id')
	async GenerateProposal(
		@Param('id')
		id: string
	): Promise<void> {
		console.log(`GenerateProposal called with id: ${id}`);

		// Note: we don't "await" because we want this to work in background asynchronously
		// TODO: we should be using here some background processing queue / library and create a task for it
		// E.g. https://github.com/taskforcesh/bullmq
		this.service.generateProposal(id).catch((error) => {
			console.log(`Error while generating proposal: ${error}`);
		});
	}

	/*
	 * Finalize job application with given Id.
	 * Set appliedDate in EmployeeJobPost and EmployeeJobApplication.
	 * Set isApplied in EmployeeJobPost.
	 * Update value of providerJobApplicationId in EmployeeJobApplication in DB.
	 */
	@Post('finalize/:id')
	async Finalize(
		@Param('id')
		id: string,
		@Body()
		@ParsedBody()
		dto: EmployeeJobApplicationFinalizeDto
	): Promise<void> {
		console.log(
			`Finalize called with id: ${id} and parameters: ${JSON.stringify(
				dto
			)}`
		);

		await this.service.finalize(id, dto);
	}

	/**
	 * Apply to Job
	 * @param req
	 * @param dto
	 * @returns
	 */
	@UseInterceptors(CrudRequestInterceptor)
	@Post('process')
	async Process(
		@ParsedRequest()
		req: CrudRequest,
		@Body()
		@ParsedBody()
		dto: EmployeeJobApplication
	): Promise<ProcessedEmployeeJobApplication> {
		console.log(
			`EmployeeJobApplicationController Process with parameters: ${JSON.stringify(
				dto
			)}`
		);

		// we extract data from dto.jobPost and create new jobPost object in our DB IF it's not exists yet.
		let jobPost: JobPost;

		if (
			(dto.providerJobId &&
				dto.providerJobId !== '00000000-0000-0000-0000-000000000000') ||
			(dto.jobPost?.providerJobId &&
				dto.jobPost?.providerJobId !==
				'00000000-0000-0000-0000-000000000000')
		) {
			jobPost = await this.jobPostRepository.findOne({
				where: {
					providerJobId:
						dto.providerJobId || dto.jobPost?.providerJobId,
				},
			});
		}

		if (!jobPost) {
			if (dto.jobPost) delete (dto.jobPost as { id?: string }).id; // create, never overwrite an existing post by id
			jobPost = await this.jobPostRepository.save(dto.jobPost);
		}

		dto.jobPostId = jobPost.id;

		// the application and its match must reference the same employee, and that employee must be ours
		const employeeId = await this.assertOwnedEmployee(dto.employeeId ?? dto.employeeJobPost?.employeeId);
		dto.employeeId = employeeId;

		// we create object EmployeeJobPost that connects employee we apply for a job and jobPost we apply to.
		let employeeJobPost: EmployeeJobPost;

		// if we know employeeJobPostId, we will use it to find employeeJobPost
		if (
			dto.employeeJobPostId &&
			dto.employeeJobPostId !== '00000000-0000-0000-0000-000000000000'
		) {
			employeeJobPost = await this.employeeJobPostRepository.findOne({
				where: { id: dto.employeeJobPostId, employeeId, ...currentTenantWhere() },
			});
			if (!employeeJobPost) {
				// an explicit id that is not ours (or not this employee's) must not fall through to creating a row from the nested object
				throw new NotFoundException(`EmployeeJobPost ${dto.employeeJobPostId} not found`);
			}
			if (employeeJobPost.jobPostId && employeeJobPost.jobPostId !== dto.jobPostId) {
				// a match is for one job post: an application through it for another job would mix two jobs
				throw new BadRequestException(`EmployeeJobPost ${dto.employeeJobPostId} is a match for another job post`);
			}
		} else {
			// if we don't know employeeJobPostId, we will try to find it by employeeId and jobPostId
			employeeJobPost = await this.employeeJobPostRepository.findOne({
				where: { employeeId, jobPostId: dto.jobPostId, ...currentTenantWhere() },
			});
		}

		if (employeeJobPost) {
			console.log(
				`Employee Job Post information:  ${JSON.stringify(
					employeeJobPost
				)}`
			);
		} else {
			console.log(
				`Can't find existed Employee Job Post, creating a new one`
			);
		}

		if (!employeeJobPost) {
			// If we don't have employeeJobPost, we will create it here.
			if (!dto.employeeJobPost) {
				dto.employeeJobPost = {
					employee: null,
					employeeId: dto.employeeId,
					isActive: true,
					isArchived: false,
					jobPost: null,
					jobPostId: null,
					providerCode: dto.providerCode,
					providerJobId: dto.providerJobId,
					jobDateCreated: dto.jobDateCreated ?? new Date(),
					jobType: dto.jobType,
					jobStatus: dto.jobStatus,
				};
			}

			dto.employeeJobPost.jobPostId = dto.jobPostId;
			this.pinToCaller(dto.employeeJobPost, employeeId);

			employeeJobPost = await this.employeeJobPostRepository.save(
				dto.employeeJobPost
			);
		}

		dto.employeeJobPostId = employeeJobPost.id;

		if (!dto.id) {
			// If we don't have employeeJobApplication.id given in request,
			// we will anyway try to search for already existed record in DB using other parameters
			const existedEmployeeJobApplication =
				await this.employeeJobApplicationRepository.findOne({
					where: {
						employeeId: dto.employeeId,
						jobPostId: dto.jobPostId,
						employeeJobPostId: dto.employeeJobPostId,
						...currentTenantWhere(),
					},
				});

			if (existedEmployeeJobApplication) {
				dto.id = existedEmployeeJobApplication.id;
			}
		}

		const newEmployeeJobApplication: EmployeeJobApplication = {
			id: dto.id,
			employeeId: dto.employeeId,
			employeeJobPostId: dto.employeeJobPostId,
			jobPostId: dto.jobPostId,
			employee: null,
			employeeJobPost: null,
			jobPost: null,
			isActive: true,
			isArchived: false,
			tenantId: requireCurrentTenantId(),
			providerCode: dto.providerCode,
			proposal: dto.proposal,
			isProposalGeneratedByAI: dto.isProposalGeneratedByAI,
			proposalTemplate: dto.proposalTemplate,
			providerJobId: dto.providerJobId,
			qa: dto.qa,
			rate: dto.rate,
			terms: dto.terms,
			appliedDate: dto.appliedDate,
			appliedStatus: dto.appliedStatus,
			jobDateCreated: dto.jobDateCreated,
			jobStatus: dto.jobStatus,
			jobType: dto.jobType,
			providerJobApplicationId: dto.providerJobApplicationId,
			attachments: dto.attachments,
		};

		// Finally we just call to base method to create EmployeeJobApplication object in our DB.
		// After that, our system will trigger command EmployeeJobApplicationCreateCommand that will be handled by handler, which itself
		// triggers event EmployeeJobApplicationCreatedEvent and next we have Saga that will automatically create an AutomationTask:
		// the prepared proposal is handed to the employee's client application, where the person reviews it and submits the
		// application through the job platform's own interface (nothing is submitted by this API).

		const employeeJobApplication: SubmittedEmployeeJobApplication =
			await this.commandBus.execute(
				new EmployeeJobApplicationCreateCommand(
					newEmployeeJobApplication
				)
			);
		// no task when the application lacks what the automation needs: it stays a draft, and the response says why
		const automationTaskBlockers = employeeJobApplication.automationTaskBlockers ?? [];

		newEmployeeJobApplication.id = employeeJobApplication.id;
		newEmployeeJobApplication.jobPost = jobPost;
		newEmployeeJobApplication.jobPostId = dto.jobPostId;
		newEmployeeJobApplication.employeeJobPost = employeeJobPost;
		newEmployeeJobApplication.employeeJobPostId = dto.employeeJobPostId;

		console.log(
			`Created Employee Job Application record in DB and suppose to trigger Saga:  ${JSON.stringify(
				newEmployeeJobApplication
			)}`
		);

		return {
			...newEmployeeJobApplication,
			automationTaskQueued: automationTaskBlockers.length === 0,
			automationTaskBlockers,
		};
	}

	@UseInterceptors(CrudRequestInterceptor)
	@Post('pre-process')
	async PreProcess(
		@ParsedRequest()
		req: CrudRequest,
		@Body()
		@ParsedBody()
		dto: EmployeeJobApplication
	): Promise<EmployeeJobApplication> {
		console.log(
			`EmployeeJobApplicationController Pre-Process with parameters: ${JSON.stringify(
				dto
			)}`
		);

		// we extract data from dto.jobPost and create new jobPost object in our DB IF it's not exists yet.
		let jobPost: JobPost;

		if (
			(dto.providerJobId &&
				dto.providerJobId !== '00000000-0000-0000-0000-000000000000') ||
			(dto.jobPost?.providerJobId &&
				dto.jobPost?.providerJobId !==
				'00000000-0000-0000-0000-000000000000')
		) {
			jobPost = await this.jobPostRepository.findOne({
				where: {
					providerJobId:
						dto.providerJobId || dto.jobPost?.providerJobId,
				},
			});
		}

		if (!jobPost) {
			if (dto.jobPost) delete (dto.jobPost as { id?: string }).id; // create, never overwrite an existing post by id
			jobPost = await this.jobPostRepository.save(dto.jobPost);
		}

		console.log(
			`Job Post information:  ${JSON.stringify({
				employeeId: dto.employeeId,
				jobPostId: dto.jobPostId,
			})}`
		);

		dto.jobPostId = jobPost.id;

		// the application and its match must reference the same employee, and that employee must be ours
		const employeeId = await this.assertOwnedEmployee(dto.employeeId ?? dto.employeeJobPost?.employeeId);
		dto.employeeId = employeeId;

		// we create object EmployeeJobPost that connects employee we apply for a job and jobPost we apply to.
		let employeeJobPost: EmployeeJobPost;

		// if we know employeeJobPostId, we will use it to find employeeJobPost
		if (
			dto.employeeJobPostId &&
			dto.employeeJobPostId !== '00000000-0000-0000-0000-000000000000'
		) {
			employeeJobPost = await this.employeeJobPostRepository.findOne({
				where: { id: dto.employeeJobPostId, employeeId, ...currentTenantWhere() },
			});
			if (!employeeJobPost) {
				// an explicit id that is not ours (or not this employee's) must not fall through to creating a row from the nested object
				throw new NotFoundException(`EmployeeJobPost ${dto.employeeJobPostId} not found`);
			}
			if (employeeJobPost.jobPostId && employeeJobPost.jobPostId !== dto.jobPostId) {
				// a match is for one job post: an application through it for another job would mix two jobs
				throw new BadRequestException(`EmployeeJobPost ${dto.employeeJobPostId} is a match for another job post`);
			}
		} else {
			// if we don't know employeeJobPostId, we will try to find it by employeeId and jobPostId
			employeeJobPost = await this.employeeJobPostRepository.findOne({
				where: { employeeId, jobPostId: dto.jobPostId, ...currentTenantWhere() },
			});
		}

		if (employeeJobPost) {
			console.log(
				`Employee Job Post information:  ${JSON.stringify(
					employeeJobPost
				)}`
			);
		} else {
			console.log(
				`Can't find existed Employee Job Post, creating a new one`
			);
		}

		if (!employeeJobPost) {
			// If we don't have employeeJobPost, we will create it here.
			if (!dto.employeeJobPost) {
				dto.employeeJobPost = {
					employee: null,
					employeeId: dto.employeeId,
					isActive: true,
					isArchived: false,
					jobPost: null,
					jobPostId: null,
					providerCode: dto.providerCode,
					providerJobId: dto.providerJobId,
					jobDateCreated: dto.jobDateCreated ?? new Date(),
					jobType: dto.jobType,
					jobStatus: dto.jobStatus,
					appliedDate: dto.appliedDate,
					appliedStatus: dto.appliedStatus,
				};
			}

			dto.employeeJobPost.jobPostId = dto.jobPostId;
			this.pinToCaller(dto.employeeJobPost, employeeId);

			employeeJobPost = await this.employeeJobPostRepository.save(
				dto.employeeJobPost
			);
		}

		dto.employeeJobPostId = employeeJobPost.id;

		let isProposalGeneratedByAI = false;

		// Only if Proposal not come from client and if client send isProposalGeneratedByAI = false, we use AI to generate it
		// So:
		// - if dto.proposal is empty and dto.isProposalGeneratedByAI = false, we will generate proposal using AI
		// - in order to skip AI generation, client should send dto.isProposalGeneratedByAI = true or send already existed proposal in dto.proposal
		if (!dto.proposal && !dto.isProposalGeneratedByAI) {
			const generateProposalRequest: GenerateProposalRequest = {
				description: dto.jobPost.description,
				skills: dto.jobPost.skills,
				title: dto.jobPost.title,
				category: dto.jobPost.category,
				employeeTemplate: dto.proposalTemplate,
				qa: dto.qa,
			};

			console.log(
				`Employee Generate Proposal Request:  ${JSON.stringify(
					generateProposalRequest
				)}`
			);

			// We call AI here to generate proposal because we are not going to trigger "normal" process with AutomationTask here,
			// but we will instead manually create proposal and send it to employee for review and approval.
			const generateProposalResponse =
				await this.aiService.generateProposal(generateProposalRequest);

			console.log(
				`Employee Generated Proposal Response:  ${JSON.stringify(
					generateProposalResponse
				)}`
			);

			dto.proposal = generateProposalResponse.proposal;

			// Only if QA not come from client, we will use QA generated by AI.
			if (!dto.qa && generateProposalResponse.qa) {
				dto.qa = generateProposalResponse.qa;
			}

			isProposalGeneratedByAI = true;
		}

		const newEmployeeJobApplication: EmployeeJobApplication = {
			employeeId: dto.employeeId,
			employeeJobPostId: dto.employeeJobPostId,
			jobPostId: dto.jobPostId,
			employee: null,
			employeeJobPost: null,
			jobPost: null,
			isActive: true,
			isArchived: false,
			tenantId: requireCurrentTenantId(),
			providerCode: dto.providerCode,
			proposal: dto.proposal,
			isProposalGeneratedByAI: isProposalGeneratedByAI,
			proposalTemplate: dto.proposalTemplate,
			providerJobId: dto.providerJobId,
			qa: dto.qa,
			rate: dto.rate,
			terms: dto.terms,
			appliedDate: dto.appliedDate,
			appliedStatus: dto.appliedStatus,
			jobDateCreated: dto.jobDateCreated,
			jobStatus: dto.jobStatus,
			jobType: dto.jobType,
			providerJobApplicationId: dto.providerJobApplicationId,
			attachments: dto.attachments,
		};

		const employeeJobApplication =
			await this.employeeJobApplicationRepository.save(
				newEmployeeJobApplication
			);

		newEmployeeJobApplication.id = employeeJobApplication.id;
		newEmployeeJobApplication.jobPost = jobPost;
		newEmployeeJobApplication.jobPostId = dto.jobPostId;
		newEmployeeJobApplication.employeeJobPost = employeeJobPost;
		newEmployeeJobApplication.employeeJobPostId = dto.employeeJobPostId;

		console.log(
			`Saved Employee Job Application record in DB: ${JSON.stringify(
				newEmployeeJobApplication
			)}`
		);

		return newEmployeeJobApplication;
	}
}
