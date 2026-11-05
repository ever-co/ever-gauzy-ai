import { UseInterceptors } from "@nestjs/common";
import { Resolver, Query, Mutation, Subscription, Args, ID } from "@nestjs/graphql";
import { InjectQueryService, QueryService } from "@ptc-org/nestjs-query-core";
import { AuthorizerInterceptor, CRUDResolver, InjectPubSub } from "@ptc-org/nestjs-query-graphql";
import { PubSub } from 'graphql-subscriptions';
import { EmployeeJobPostDTO } from "@packages/dto";
import { EmployeeJobPost } from "@packages/entities";
import { EmployeeJobPostService } from '../employeeJobPost.service';
import { MATCH_CREATED_EVENT, MATCH_UPDATED_EVENT } from '../employeeJobPost.service';
import { BrowseJobMatchesArgs } from '../dto/browseJobMatches.args';
import { BrowseJobMatchesResult } from '../dto/browseJobMatches.type';

/**
 * Subscription filter: a client only receives match events of its own tenant (the payload's
 * `tenantId` must equal the authenticated tenant in the GraphQL context), optionally narrowed to
 * one employee.
 */
export function matchEventFilter(eventKey: string) {
	return (payload: any, variables: { employeeId?: string }, context?: { req?: { tenant?: { id?: string } } }): boolean => {
		const event = payload?.[eventKey];
		const tenantId = context?.req?.tenant?.id;
		if (!event || !tenantId || event.tenantId !== tenantId) return false;
		return !variables?.employeeId || event.employeeId === variables.employeeId;
	};
}

@Resolver(() => EmployeeJobPost)
@UseInterceptors(AuthorizerInterceptor(EmployeeJobPostDTO))
export class EmployeeJobPostResolver extends CRUDResolver(EmployeeJobPostDTO, {
	delete: { disabled: true },
	enableAggregate: true,
	enableTotalCount: true
}) {
	constructor(
		@InjectQueryService(EmployeeJobPost) readonly service: QueryService<EmployeeJobPost>,
		@InjectPubSub() readonly pubSub: PubSub,
		private readonly employeeJobPostService: EmployeeJobPostService,
	) {
		super(service);
	}

	/**
	 * Browse job matches for an employee with filtering, sorting, and pagination.
	 */
	@Query(() => BrowseJobMatchesResult, {
		name: 'browseJobMatches',
		description: 'Browse job matches for an employee with filters, sorting, and pagination',
	})
	async browseJobMatches(
		@Args() args: BrowseJobMatchesArgs,
	): Promise<BrowseJobMatchesResult> {
		return this.employeeJobPostService.browseMatches(args);
	}

	/**
	 * Re-run AI scoring on an existing match.
	 */
	@Mutation(() => EmployeeJobPostDTO, {
		name: 'rescoreMatch',
		description: 'Re-run AI scoring on an existing employee-job match',
	})
	async rescoreMatch(
		@Args('id', { type: () => ID }) id: string,
	): Promise<EmployeeJobPost> {
		return this.employeeJobPostService.rescoreMatch(id);
	}

	/**
	 * Dismiss (archive) a match so it no longer appears in browse results.
	 */
	@Mutation(() => EmployeeJobPostDTO, {
		name: 'dismissMatch',
		description: 'Dismiss (archive) a job match',
	})
	async dismissMatch(
		@Args('id', { type: () => ID }) id: string,
	): Promise<EmployeeJobPost> {
		return this.employeeJobPostService.dismissMatch(id);
	}

	/*
	|--------------------------------------------------------------------------
	| @Subscription
	|--------------------------------------------------------------------------
	*/

	/**
	 * Real-time subscription for new matches.
	 * Optionally filter by employeeId to receive only your matches.
	 */
	@Subscription(() => EmployeeJobPostDTO, {
		name: MATCH_CREATED_EVENT,
		description: 'Subscribe to new employee-job matches (optionally filtered by employeeId)',
		filter: matchEventFilter(MATCH_CREATED_EVENT),
	})
	onMatchCreated(
		@Args('employeeId', { type: () => ID, nullable: true }) _employeeId?: string,
	) {
		return this.pubSub.asyncIterableIterator(MATCH_CREATED_EVENT);
	}

	/**
	 * Real-time subscription for match updates (rescore, dismiss, etc.).
	 * Optionally filter by employeeId.
	 */
	@Subscription(() => EmployeeJobPostDTO, {
		name: MATCH_UPDATED_EVENT,
		description: 'Subscribe to match updates (rescore, dismiss) — optionally filtered by employeeId',
		filter: matchEventFilter(MATCH_UPDATED_EVENT),
	})
	onMatchUpdated(
		@Args('employeeId', { type: () => ID, nullable: true }) _employeeId?: string,
	) {
		return this.pubSub.asyncIterableIterator(MATCH_UPDATED_EVENT);
	}
}
