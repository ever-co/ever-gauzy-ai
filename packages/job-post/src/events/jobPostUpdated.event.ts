import { JobPost } from "@packages/entities";

/**
 * Published by JobPostCreateCommandHandler for the crawled posts that were already stored (and
 * therefore only refreshed): the posts a live provider found again and those the `source-db`
 * provider re-offers. The saga re-matches them against employees whose matching inputs changed
 * since (see EmployeeJobPostService.rematch()).
 */
export class JobPostUpdatedEvent {
	constructor(public readonly jobPosts: JobPost[]) {}
}
