import { JobPost } from '@packages/entities';

/**
 * Result of a job liveness check.
 */
export interface LivenessResult {
	/** Whether the job is still open and accepting applications (meaningless when `verified` is false) */
	isOpen: boolean;
	/** Optional reason (e.g., '404 not found', 'job closed marker detected') */
	reason?: string;
	/**
	 * `false` when the provider reached no verdict (refused URL, network error, an answer it cannot
	 * read, no credentials): the stored `isExpired` is then left as it is. Absent means verified.
	 */
	verified?: boolean;
}

/**
 * The stored post a liveness check is about: what a provider needs to decide whether it is the
 * post's verifier (`canVerify`) and to identify the posting at its source.
 */
export interface LivenessJob {
	/** `JobPost.id` */
	id?: string;
	/** The source site (`JobPost.providerCode`, e.g. `linkedin`, `upwork`) */
	providerCode: string;
	/** The posting's id at that source as stored (`JobPost.providerJobId`) */
	providerJobId?: string;
	/** `providerCode` of the provider that stored the post (`JobPost.ingestedBy`); null for rows no provider stored */
	ingestedBy?: string | null;
	/** `JobPost.url`, else `JobPost.sourceUrl`; absent when the post has neither */
	url?: string;
	/**
	 * Tenants whose own source credentials may be used for this check: only the requesting tenant
	 * for a request (`verifyJobLiveness`; never another tenant's), the tenants the post was matched
	 * for in a background check — with `sourceCode`, only those with an active source config of
	 * their own for that source carrying credentials (the limit applies after that filter). Loaded
	 * on demand (only API-backed checks need it).
	 */
	tenantIds?: (sourceCode?: string) => Promise<string[]>;
}

/**
 * Search criterion passed by the crawler to a provider.
 * Derived from employee-specific JobSearchCriterion entities in the DB.
 */
export interface SearchCriterion {
	/**
	 * Tenant the criterion belongs to. Providers use it to pick that tenant's own source
	 * credentials (never another tenant's); absent for deployment-wide defaults.
	 */
	tenantId?: string;
	/** The search term / keywords (e.g., "React Developer", "DevOps Engineer") */
	keyword?: string;
	/** Geographic location filter (e.g., "New York", "Berlin") */
	location?: string;
	/** Country enum value (e.g., "USA", "GERMANY") */
	country?: string;
	/** Job type filter: "hourly" or "fixed" */
	jobType?: string;
	/** Only include remote positions */
	isRemote?: boolean;
	/** Max age of listings in hours */
	hoursOld?: number;
}

/**
 * Interface that all job providers must implement.
 * This abstraction allows the crawler to work with multiple providers
 * (e.g., Ever Jobs API, or any future provider).
 */
export interface IJobProvider {
	/**
	 * Unique identifier for this provider (e.g., 'ever-jobs', 'custom-scraper')
	 */
	readonly providerCode: string;

	/**
	 * Human-readable name of the provider
	 */
	readonly providerName: string;

	/**
	 * Fetches jobs from the provider based on configured search criteria.
	 * This is the legacy method — kept for backward compatibility with
	 * providers that use static config. New providers should implement
	 * getJobsForCriteria() instead.
	 * @returns Promise resolving to an array of JobPost entities
	 */
	getJobs(): Promise<JobPost[]>;

	/**
	 * Checks if the provider is enabled and properly configured
	 * @returns Promise resolving to true if the provider can fetch jobs
	 */
	isEnabled(): Promise<boolean>;

	/**
	 * Fetches jobs matching a specific search criterion.
	 * Called by the crawler for each unique employee criterion.
	 * If not implemented, the crawler falls back to getJobs().
	 */
	getJobsForCriteria?(criterion: SearchCriterion): Promise<JobPost[]>;

	/**
	 * Optional: whether this provider is the verifier of `job` (see `verifyJob`). Without it, a
	 * provider verifies the posts it stored itself that have a URL:
	 * `providerCode === (job.ingestedBy ?? job.providerCode)`. A provider that can verify a post
	 * without a URL (by id, through an API) must claim it here.
	 * A provider that owns a source site whatever channel stored the post (Upwork: only its official
	 * API may be asked) claims it here, and the other providers must then not claim it.
	 */
	canVerify?(job: LivenessJob): boolean;

	/**
	 * Optional: Verify whether a job posting is still live/open. `JobPostService.checkLiveness()`
	 * calls the first provider that `canVerify` the post and stores the verdict in `isExpired`
	 * (a result with `verified: false`, or an error, leaves `isExpired` unchanged).
	 * @param jobUrl - The URL of the job posting to verify ('' when the post has none: only a provider
	 *   whose `canVerify` accepted such a post is called without one)
	 * @param job - The stored post (source site, posting id, ingesting provider, tenants)
	 * @returns Promise resolving to a LivenessResult
	 */
	verifyJob?(jobUrl: string, job?: LivenessJob): Promise<LivenessResult>;
}

/**
 * Token used for dependency injection of job providers
 */
export const JOB_PROVIDERS_TOKEN = 'JOB_PROVIDERS';
