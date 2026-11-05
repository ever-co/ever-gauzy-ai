import { JobPost } from "@packages/entities";

export interface MatchJobPostsOptions {
	/**
	 * The posts were already stored before this crawl (found again, or re-offered by the `source-db`
	 * provider): only employees whose criteria or profile changed since are matched against them
	 * (EmployeeJobPostService.rematch()). Default: new posts, matched against every employee.
	 */
	existing?: boolean;
}

export class MatchJobPostsToEmployeesCommand {
	constructor(
		public readonly jobPosts: JobPost[],
		public readonly options: MatchJobPostsOptions = {},
	) {}
}
