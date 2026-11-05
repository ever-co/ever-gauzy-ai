import { UseInterceptors } from "@nestjs/common";
import { Resolver, Mutation, Query, Args, ID, ObjectType, Field } from "@nestjs/graphql";
import { InjectQueryService, QueryService } from "@ptc-org/nestjs-query-core";
import { AuthorizerInterceptor, CRUDResolver, InjectPubSub } from "@ptc-org/nestjs-query-graphql";
import { PubSub } from 'graphql-subscriptions';
import { EmployeeJobApplicationDTO } from "@packages/dto";
import { EmployeeJobApplication } from "@packages/entities";
import { EmployeeJobApplicationService } from "../employeeJobApplication.service";

@ObjectType('ApplicationStatusResponse')
class ApplicationStatusResponse {
	@Field(() => ID) id: string;
	@Field({ nullable: true }) appliedStatus?: string;
	@Field({ nullable: true }) appliedDate?: Date;
	@Field() hasProposal: boolean;
	@Field() isProposalGeneratedByAI: boolean;
	@Field() isViewedByClient: boolean;
	@Field() providerCode: string;
	@Field({ nullable: true }) providerJobApplicationId?: string;
	@Field({ nullable: true }) jobTitle?: string;
	@Field() createdAt: Date;
	/** Why the application cannot be sent as an automation task yet (empty when it can be). */
	@Field(() => [String], { description: 'Why the application cannot be sent as an automation task yet (empty when it can be)' })
	automationTaskBlockers: string[];
}

@Resolver(() => EmployeeJobApplication)
@UseInterceptors(AuthorizerInterceptor(EmployeeJobApplicationDTO))
export class EmployeeJobApplicationResolver extends CRUDResolver(EmployeeJobApplicationDTO, {
	delete: { disabled: true },
	enableAggregate: true,
	enableTotalCount: true
}) {
	constructor(
		@InjectQueryService(EmployeeJobApplication) readonly service: QueryService<EmployeeJobApplication>,
		@InjectPubSub() readonly pubSub: PubSub,
		private readonly employeeJobApplicationService: EmployeeJobApplicationService,
	) {
		super(service);
	}

	/**
	 * Get the current status of a job application.
	 */
	@Query(() => ApplicationStatusResponse)
	async applicationStatus(
		@Args('id', { type: () => ID }) id: string,
	): Promise<ApplicationStatusResponse> {
		return this.employeeJobApplicationService.getApplicationStatus(id) as any;
	}

	/**
	 * Apply to a job from a matched EmployeeJobPost.
	 * Creates an EmployeeJobApplication, generates AI proposal + QA, and returns the result.
	 */
	@Mutation(() => EmployeeJobApplicationDTO)
	async applyToJob(
		@Args('employeeJobPostId', { type: () => ID }) employeeJobPostId: string,
	): Promise<EmployeeJobApplication> {
		return this.employeeJobApplicationService.apply(employeeJobPostId);
	}

	/**
	 * Re-generate the AI proposal for an existing application.
	 */
	@Mutation(() => EmployeeJobApplicationDTO)
	async generateApplicationProposal(
		@Args('applicationId', { type: () => ID }) applicationId: string,
	): Promise<EmployeeJobApplication> {
		await this.employeeJobApplicationService.generateProposal(applicationId);
		return this.employeeJobApplicationService.repo.findOne({
			where: { id: applicationId },
			relations: { jobPost: true, employeeJobPost: true },
		});
	}
}
