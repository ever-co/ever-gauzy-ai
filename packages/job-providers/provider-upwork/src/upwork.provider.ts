import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IJobProvider, LivenessJob, LivenessResult, SearchCriterion } from '@packages/core-providers';
import { JobPost } from '@packages/entities';
import { SourceConfigService } from '@packages/sourceConfig/sourceConfig.service';

export const UPWORK_PROVIDER_CONFIG = 'UPWORK_PROVIDER_CONFIG';

/** Global settings of the Upwork provider; credentials usually come from the tenant's source config. */
export interface UpworkProviderConfig {
	/** GraphQL endpoint (default https://api.upwork.com/graphql). */
	apiUrl?: string;
	/** OAuth2 token endpoint (default https://www.upwork.com/api/v3/oauth2/token). */
	tokenUrl?: string;
	/** Results per search (default 50, max 100 per Upwork page). */
	resultsWanted?: number;
	/** Deadline for each request to Upwork, body included (ms; default UPWORK_TIMEOUT_MS or 30 s). */
	timeoutMs?: number;
	/** Fallback credentials when no `upwork` source config exists (UPWORK_* variables). */
	clientId?: string;
	clientSecret?: string;
	accessToken?: string;
	/** Upwork organization id sent as X-Upwork-API-TenantId (optional). */
	organizationId?: string;
}

interface UpworkCredentials {
	clientId?: string;
	clientSecret?: string;
	accessToken?: string;
	organizationId?: string;
}

/** Shape of a `marketplaceJobPostingsSearch` node (the fields this provider reads; all optional). */
interface UpworkJobNode {
	id?: string;
	title?: string;
	description?: string;
	ciphertext?: string;
	createdDateTime?: string;
	publishedDateTime?: string;
	category?: string;
	subcategory?: string;
	duration?: string;
	durationLabel?: string;
	skills?: Array<{ name?: string }>;
	hourlyBudgetMin?: { rawValue?: string | number; currencyCode?: string };
	hourlyBudgetMax?: { rawValue?: string | number; currencyCode?: string };
	amount?: { rawValue?: string | number; currencyCode?: string };
	job?: { contractTerms?: { contractType?: string } };
	client?: {
		location?: { country?: string; city?: string };
		totalFeedback?: number;
		totalReviews?: number;
		totalPostedJobs?: number;
		totalHires?: number;
		verificationStatus?: string;
	};
}

/** GraphQL document for the marketplace job search (Upwork public API). */
export const UPWORK_SEARCH_QUERY = `
query GauzyAiJobSearch($filter: MarketplaceJobPostingSearchFilter, $pagination: Pagination) {
  marketplaceJobPostingsSearch(marketPlaceJobFilter: $filter, searchType: USER_JOBS_SEARCH, sortAttributes: [{ field: RECENCY }], pagination: $pagination) {
    totalCount
    edges {
      node {
        id title description ciphertext createdDateTime publishedDateTime category subcategory duration durationLabel
        skills { name }
        hourlyBudgetMin { rawValue currencyCode }
        hourlyBudgetMax { rawValue currencyCode }
        amount { rawValue currencyCode }
        job { contractTerms { contractType } }
        client { location { country city } totalFeedback totalReviews totalPostedJobs totalHires verificationStatus }
      }
    }
  }
}`;

/**
 * GraphQL document for the liveness check of one posting (Upwork public API, same "Read marketplace
 * Job Postings" permission as the search): `workFlowState.status` is `ACTIVE` or `CLOSED`.
 */
export const UPWORK_JOB_STATE_QUERY = `
query GauzyAiJobState($id: ID!) {
  marketplaceJobPosting(id: $id) {
    id
    workFlowState { status closeResult }
  }
}`;

/** `workFlowState.closeResult` of a closed posting, as documented by Upwork. */
const UPWORK_CLOSE_RESULTS: Record<string, string> = {
	'0': 'filled (at least one contract)',
	'1': 'closed without a contract',
	'2': 'cancelled by Upwork',
	'3': 'expired after 30 days without activity',
};

/** `providerJobId` of an Upwork posting stored by Ever Jobs: `upwork-` + its id `upwork-<Upwork posting id>`. */
const RELAYED_POSTING_ID = /^(?:upwork-)+(\d{10,})$/;

/**
 * Job source backed by Upwork's **official** API (GraphQL `marketplaceJobPostingsSearch`,
 * OAuth2 client credentials or a pre-obtained access token). Nothing is scraped and nothing is
 * submitted on the user's behalf: the provider only reads public job postings the API exposes
 * to the authorised application, within Upwork's API terms.
 *
 * Credentials: the tenant's `source_config` row for `upwork` (`clientId`/`clientSecret` for
 * `client_credentials`, or `accessToken`), falling back to `UPWORK_CLIENT_ID` /
 * `UPWORK_CLIENT_SECRET` / `UPWORK_ACCESS_TOKEN`. Without any, searches return nothing.
 *
 * Liveness: the verifier of every Upwork posting, whether it came through this provider or
 * through Ever Jobs (`providerCode = 'upwork'`). It asks the same API for the posting's workflow
 * state (`marketplaceJobPosting`) and never requests upwork.com pages.
 */
@Injectable()
export class UpworkProvider implements IJobProvider {
	readonly providerCode = 'upwork';
	readonly providerName = 'Upwork (official API)';
	private readonly logger = new Logger(UpworkProvider.name);
	private token?: { value: string; expiresAt: number; key: string };

	constructor(
		@Inject(UPWORK_PROVIDER_CONFIG) private readonly config: UpworkProviderConfig,
		@Optional() private readonly sourceConfigService?: SourceConfigService,
		private readonly fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = (input, init) => fetch(input, init)
	) {}

	/**
	 * Always eligible for dispatch: credentials are per tenant and resolved per search (a deployment
	 * may have only per-tenant source configs), and a search without credentials returns nothing.
	 */
	async isEnabled(): Promise<boolean> {
		return true;
	}

	/** Legacy entry point: Upwork needs a search expression, so nothing is fetched without criteria. */
	async getJobs(): Promise<JobPost[]> {
		return [];
	}

	async getJobsForCriteria(criterion: SearchCriterion): Promise<JobPost[]> {
		const credentials = await this.credentials(criterion.tenantId);
		if (!credentials) {
			return [];
		}
		if (!criterion.keyword) {
			return [];
		}
		const filter: Record<string, unknown> = { searchExpression_eq: criterion.keyword };
		if (criterion.jobType) {
			const jobType = criterion.jobType.toLowerCase();
			if (jobType.startsWith('hour')) filter.jobType_eq = 'HOURLY';
			if (jobType.startsWith('fix')) filter.jobType_eq = 'FIXED';
		}
		const payload = await this.graphql<{ marketplaceJobPostingsSearch?: { edges?: Array<{ node?: UpworkJobNode }> } }>(credentials, UPWORK_SEARCH_QUERY, {
			filter,
			pagination: { first: Math.min(this.config.resultsWanted ?? 50, 100) },
		});
		const nodes = (payload?.marketplaceJobPostingsSearch?.edges ?? []).map((e) => e.node).filter(Boolean) as UpworkJobNode[];
		const jobs = nodes.map((node) => this.map(node, criterion)).filter((job): job is JobPost => job !== null);
		this.logger.log(`[Upwork] ${jobs.length} job(s) for "${criterion.keyword}"`);
		return jobs;
	}

	/** Every Upwork posting, whichever provider stored it: Upwork may only be asked through this API. */
	canVerify(job: LivenessJob): boolean {
		return job.providerCode === this.providerCode;
	}

	/**
	 * Liveness through the official API only (`marketplaceJobPosting(id)` → `workFlowState.status`):
	 * `CLOSED` closes the job, `ACTIVE` keeps it open. `jobUrl` is never requested (Upwork's terms) and
	 * not needed (a post without one is checked by its id). Credentials: the first of
	 * `job.tenantIds()` (the requesting tenant on a request, the matched tenants in a background check)
	 * with an `upwork` source config of its own, else the tenant-less config / UPWORK_* fallback. No
	 * posting id, no credentials, an API error or an unknown state is no verdict (`verified: false`):
	 * the stored state is kept.
	 */
	async verifyJob(_jobUrl: string, job?: LivenessJob): Promise<LivenessResult> {
		const postingId = job && this.postingId(job);
		if (!job || !postingId) {
			return { isOpen: true, verified: false, reason: 'Not verifiable: no Upwork posting id' };
		}
		try {
			const credentials = await this.verificationCredentials(job);
			if (!credentials) {
				return { isOpen: true, verified: false, reason: 'Not verifiable: no Upwork API credentials' };
			}
			const payload = await this.graphql<{ marketplaceJobPosting?: { workFlowState?: { status?: string; closeResult?: string | null } } | null }>(
				credentials,
				UPWORK_JOB_STATE_QUERY,
				{ id: postingId }
			);
			const state = payload?.marketplaceJobPosting?.workFlowState;
			const status = state?.status?.toUpperCase();
			if (status === 'CLOSED') {
				const result = state.closeResult != null ? (UPWORK_CLOSE_RESULTS[String(state.closeResult)] ?? `close result ${state.closeResult}`) : undefined;
				return { isOpen: false, reason: `Closed on Upwork${result ? `: ${result}` : ''}` };
			}
			if (status === 'ACTIVE') {
				return { isOpen: true };
			}
			return { isOpen: true, verified: false, reason: `Not verified: Upwork returned ${status ? `workflow state ${status}` : 'no posting'} for ${postingId}` };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(`[Upwork] liveness of ${postingId} not verified: ${message}`);
			return { isOpen: true, verified: false, reason: `Verification failed: ${message}` };
		}
	}

	/**
	 * The Upwork posting id: `providerJobId` as stored by this provider (or by no provider), the
	 * embedded id of a posting Ever Jobs relayed (`upwork-upwork-<id>`); none for anything else.
	 */
	private postingId(job: LivenessJob): string | undefined {
		const stored = job.providerJobId?.trim();
		if (!stored) return undefined;
		const relayed = stored.match(RELAYED_POSTING_ID);
		if (relayed) return relayed[1];
		return !job.ingestedBy || job.ingestedBy === this.providerCode ? stored : undefined;
	}

	/** The first of these tenants' own credentials (see `LivenessJob.tenantIds`); then the deployment-wide ones. */
	private async verificationCredentials(job: LivenessJob): Promise<UpworkCredentials | null> {
		// only tenants with a usable `upwork` config of their own are offered (filtered before any limit)
		for (const tenantId of (await job.tenantIds?.(this.providerCode)) ?? []) {
			const own = await this.storedCredentials(tenantId);
			if (own && own.tenantId === tenantId) {
				return own.credentials;
			}
		}
		return this.credentials();
	}

	/** One request to the GraphQL API with these credentials: the `data`, or an error (HTTP or GraphQL). */
	private async graphql<T>(credentials: UpworkCredentials, query: string, variables: Record<string, unknown>): Promise<T | undefined> {
		const token = await this.accessToken(credentials);
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		};
		if (credentials.organizationId) {
			headers['X-Upwork-API-TenantId'] = credentials.organizationId;
		}
		const response = await this.fetchFn(this.config.apiUrl ?? 'https://api.upwork.com/graphql', {
			method: 'POST',
			headers,
			body: JSON.stringify({ query, variables }),
			// a stalled or trickling response must not hold the crawler's provider loop
			signal: AbortSignal.timeout(this.timeoutMs()),
		});
		if (!response.ok) {
			throw new Error(`Upwork API returned ${response.status} ${response.statusText}`);
		}
		const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
		if (payload.errors?.length) {
			throw new Error(`Upwork API: ${payload.errors.map((e) => e.message).join('; ')}`);
		}
		return payload.data;
	}

	/** The tenant's own `upwork` source config (or a tenant-less one), then the UPWORK_* fallback; never another tenant's. */
	private async credentials(tenantId?: string): Promise<UpworkCredentials | null> {
		const stored = await this.storedCredentials(tenantId);
		if (stored) {
			return stored.credentials;
		}
		if (this.config.accessToken || (this.config.clientId && this.config.clientSecret)) {
			return {
				clientId: this.config.clientId,
				clientSecret: this.config.clientSecret,
				accessToken: this.config.accessToken,
				organizationId: this.config.organizationId,
			};
		}
		return null;
	}

	/**
	 * The usable `upwork` source config for this tenant (its own, else a tenant-less one) with the
	 * tenant it belongs to; null when there is none or the source configs cannot be read.
	 */
	private async storedCredentials(tenantId?: string): Promise<{ tenantId?: string | null; credentials: UpworkCredentials } | null> {
		try {
			const stored = await this.sourceConfigService?.getConfigForSource('upwork', undefined, tenantId);
			if (stored && (stored.accessToken || (stored.clientId && stored.clientSecret))) {
				return {
					tenantId: stored.tenantId,
					credentials: {
						clientId: stored.clientId,
						clientSecret: stored.clientSecret,
						accessToken: stored.accessToken,
						organizationId: stored.sourceOrgId ?? this.config.organizationId,
					},
				};
			}
		} catch (error) {
			this.logger.warn(`Upwork source config unavailable: ${error instanceof Error ? error.message : error}`);
		}
		return null;
	}

	/** A pre-obtained access token as is, otherwise a client-credentials token cached until it expires. */
	private async accessToken(credentials: UpworkCredentials): Promise<string> {
		if (credentials.accessToken) {
			return credentials.accessToken;
		}
		// the cache identity covers the secret too: a changed or different secret never reuses a token
		const key = createHash('sha256').update(`${credentials.clientId ?? ''}:${credentials.clientSecret ?? ''}`).digest('hex');
		if (this.token && this.token.key === key && this.token.expiresAt > Date.now() + 30_000) {
			return this.token.value;
		}
		const form = new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: credentials.clientId ?? '',
			client_secret: credentials.clientSecret ?? '',
		});
		const response = await this.fetchFn(this.config.tokenUrl ?? 'https://www.upwork.com/api/v3/oauth2/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form.toString(),
			signal: AbortSignal.timeout(this.timeoutMs()),
		});
		if (!response.ok) {
			throw new Error(`Upwork OAuth2 token request failed: ${response.status} ${response.statusText}`);
		}
		const data = (await response.json()) as { access_token?: string; expires_in?: number };
		if (!data.access_token) {
			throw new Error('Upwork OAuth2 token response has no access_token');
		}
		this.token = { value: data.access_token, key, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
		return this.token.value;
	}

	private timeoutMs(): number {
		return this.config.timeoutMs ?? (Number(process.env.UPWORK_TIMEOUT_MS) || 30_000);
	}

	private map(node: UpworkJobNode, criterion: SearchCriterion): JobPost | null {
		if (!node.id || !node.title) {
			return null;
		}
		const job = new JobPost();
		job.providerCode = this.providerCode;
		job.providerJobId = node.id;
		job.ingestedBy = this.providerCode; // the official API, not Ever Jobs (whose Upwork posts share the code)
		job.title = node.title;
		job.description = node.description ?? undefined;
		job.url = node.ciphertext ? `https://www.upwork.com/jobs/${node.ciphertext}` : undefined;
		job.sourceUrl = job.url;
		job.jobDateCreated = node.publishedDateTime || node.createdDateTime ? new Date(node.publishedDateTime || node.createdDateTime) : undefined;
		job.jobStatus = 'Open';
		job.isActive = true;
		job.isArchived = false;
		job.isRemote = true;
		job.category = node.category ?? undefined;
		job.subcategory = node.subcategory ?? undefined;
		job.duration = node.durationLabel ?? node.duration ?? undefined;
		job.skills = (node.skills ?? []).map((s) => s?.name).filter(Boolean).join(', ') || undefined;
		job.searchKeyword = criterion.keyword;
		job.searchJobType = criterion.jobType;

		const contractType = node.job?.contractTerms?.contractType?.toUpperCase();
		const hourlyMin = toNumber(node.hourlyBudgetMin?.rawValue);
		const hourlyMax = toNumber(node.hourlyBudgetMax?.rawValue);
		const fixed = toNumber(node.amount?.rawValue);
		if (contractType === 'HOURLY' || hourlyMin !== undefined || hourlyMax !== undefined) {
			job.jobType = 'hourly';
			job.compensationMin = hourlyMin;
			// a posting with only a minimum has no advertised ceiling: it must stay open-ended (the
			// minimum-rate rule treats a missing maximum as unknown, never as a limit)
			job.compensationMax = hourlyMax;
			job.compensationCurrency = node.hourlyBudgetMax?.currencyCode ?? node.hourlyBudgetMin?.currencyCode ?? undefined;
			job.compensationInterval = 'hourly';
			job.budget = hourlyBudgetText(hourlyMin, hourlyMax, job.compensationCurrency);
		} else {
			job.jobType = 'fixed';
			job.compensationMin = fixed;
			job.compensationMax = fixed;
			job.compensationCurrency = node.amount?.currencyCode ?? undefined;
			job.compensationInterval = 'fixed';
			job.budget = fixed !== undefined ? `${fmt(fixed, job.compensationCurrency)} fixed` : undefined;
		}

		job.country = node.client?.location?.country ?? undefined;
		job.location = [node.client?.location?.city, node.client?.location?.country].filter(Boolean).join(', ') || undefined;
		job.clientFeedback = node.client?.totalFeedback !== undefined ? String(node.client.totalFeedback) : undefined;
		job.clientReviewsCount = node.client?.totalReviews ?? undefined;
		job.clientJobsPosted = node.client?.totalPostedJobs ?? undefined;
		job.clientPastHires = node.client?.totalHires ?? undefined;
		job.clientPaymentVerificationStatus = node.client?.verificationStatus ? node.client.verificationStatus.toUpperCase() === 'VERIFIED' : undefined;
		return job;
	}
}

const toNumber = (value: unknown): number | undefined => {
	if (value === undefined || value === null || value === '') return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
};
const fmt = (value: number, currency?: string): string => (!currency || currency === 'USD' ? `$${value}` : `${value} ${currency}`);

/** "$30-$60/hr", "from $30/hr" (no ceiling), "up to $60/hr" (no floor), or nothing. */
const hourlyBudgetText = (min: number | undefined, max: number | undefined, currency?: string): string | undefined => {
	if (min !== undefined && max !== undefined) return `${fmt(min, currency)}-${fmt(max, currency)}/hr`;
	if (min !== undefined) return `from ${fmt(min, currency)}/hr`;
	if (max !== undefined) return `up to ${fmt(max, currency)}/hr`;
	return undefined;
};
