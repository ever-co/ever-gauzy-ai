import { InjectQueryService, QueryService } from "@ptc-org/nestjs-query-core";
import { CRUDResolver, InjectPubSub } from "@ptc-org/nestjs-query-graphql";
import { Resolver, Mutation, Args, ID } from "@nestjs/graphql";
import { PubSub } from 'graphql-subscriptions';
import { JobPostDTO } from "@packages/dto";
import { JobPost } from "@packages/entities/jobPost.entity";
import { JobPostService } from "../jobPost.service";

@Resolver(() => JobPost)
// @ts-ignore — TS2415: JobPost entity ≠ JobPostDTO, but nestjs-query handles it at runtime
export class JobPostResolver extends CRUDResolver(JobPostDTO, {
	delete: { disabled: true },
	enableAggregate: true,
	enableTotalCount: true,
}) {
	constructor(
		@InjectQueryService(JobPost) readonly service: QueryService<JobPost>,
		@InjectPubSub() readonly pubSub: PubSub,
		private readonly jobPostService: JobPostService,
	) {
		super(service as any);
	}

	/**
	 * Verify whether a job posting is still live/open.
	 * Calls the provider's verifyJob() method and updates isExpired/expiryCheckedAt.
	 */
	@Mutation(() => JobPostDTO, {
		description: 'Verify if a job posting is still open. Updates isExpired and expiryCheckedAt fields.',
	})
	async verifyJobLiveness(
		@Args('jobPostId', { type: () => ID }) jobPostId: string,
	): Promise<JobPost> {
		return this.jobPostService.checkLiveness(jobPostId);
	}
}

