import { Injectable, Logger } from '@nestjs/common';
import { IJobProvider, LivenessJob, LivenessResult, SearchCriterion } from '@packages/core-providers';
import { JobPost } from '@packages/entities';
import {
	EverJobsClientService,
	EverJobsSearchInput,
	EverJobsSite,
	EverJobsDescriptionFormat,
} from '@packages/ever-jobs-client';
import { EVER_JOBS_PROVIDER_CODE, EverJobsMapperService } from './ever-jobs-mapper.service';
import { SourceConfigService } from '@packages/sourceConfig/sourceConfig.service';
import { PinnedRequest, pinnedRequest, PublicTarget, resolvePublicUrl, Resolver, UnsafeUrlError } from '@packages/core/net/public-url';

/**
 * Configuration for the Ever Jobs provider.
 * Contains only global defaults — per-search parameters come from employee criteria.
 */
export interface EverJobsProviderConfig {
	/** Comma-separated list of site codes to query (e.g., "linkedin,indeed,glassdoor") */
	sites?: string;

	/** Default number of results to request per crawl (can be overridden by criteria) */
	resultsWanted?: number;
}

/**
 * IJobProvider implementation that fetches jobs from the Ever Jobs API.
 *
 * This is a single "meta-provider" that can query all 25+ Ever Jobs sources.
 * Individual jobs receive their source's providerCode (e.g., "linkedin") and
 * `ingestedBy = 'ever-jobs'`, which makes this provider their liveness verifier.
 *
 * The provider supports two modes:
 * 1. getJobsForCriteria(criterion) — preferred: takes per-employee search criteria
 * 2. getJobs() — legacy fallback: uses only global config (sites, resultsWanted)
 */
@Injectable()
export class EverJobsProvider implements IJobProvider {
	readonly providerCode = EVER_JOBS_PROVIDER_CODE;
	readonly providerName = 'Ever Jobs API';

	private readonly logger = new Logger(EverJobsProvider.name);

	constructor(
		private readonly client: EverJobsClientService,
		private readonly mapper: EverJobsMapperService,
		private readonly config: EverJobsProviderConfig,
		private readonly sourceConfigService: SourceConfigService,
	) {
		this.logger.log(
			`EverJobsProvider initialized — ` +
			`sites: ${config.sites ?? 'all'}, ` +
			`resultsWanted: ${config.resultsWanted ?? 'default'}`,
		);
	}

	async isEnabled(): Promise<boolean> {
		return !!this.client;
	}

	/**
	 * Legacy fallback — searches with global config only (no per-employee criteria).
	 * The crawler prefers getJobsForCriteria() when employee criteria are available.
	 */
	async getJobs(): Promise<JobPost[]> {
		return this.getJobsForCriteria({});
	}

	/**
	 * Fetches jobs matching a specific search criterion.
	 * Called by the crawler for each unique employee search criterion.
	 *
	 * Maps criterion fields to the Ever Jobs API:
	 *   keyword  → searchTerm
	 *   location → location
	 *   country  → country (via Ever Jobs Country enum)
	 *   isRemote → isRemote
	 *   hoursOld → hoursOld
	 */
	async getJobsForCriteria(criterion: SearchCriterion): Promise<JobPost[]> {
		const input = this.buildSearchInput(criterion);

		this.logger.log(
			`Fetching jobs from Ever Jobs API: ` +
			`term="${input.searchTerm ?? ''}", ` +
			`location="${input.location ?? ''}", ` +
			`country="${input.country ?? ''}", ` +
			`remote=${input.isRemote ?? 'any'}, ` +
			`sites=${input.siteType?.join(',') ?? 'all'}`,
		);

		try {
			// Load source auth from DB and attach to the request
			await this.attachSourceAuth(input, criterion.tenantId);

			const dtos = await this.client.searchJobs(input);
			const mapped = this.mapper.mapMany(dtos, input.searchTerm);

			this.logger.log(
				`Ever Jobs returned ${dtos.length} job(s) for "${input.searchTerm ?? 'all'}", ` +
				`mapped ${mapped.length} to JobPost entities`,
			);

			return mapped;
		} catch (error) {
			this.logger.error(
				`Error fetching jobs from Ever Jobs API ` +
				`(term="${input.searchTerm ?? ''}", location="${input.location ?? ''}"): ` +
				`${error instanceof Error ? error.message : error}`,
			);
			return [];
		}
	}

	/**
	 * Loads source credentials from DB and attaches them to the search input.
	 * Supports any source that has a config entry in the source_config table.
	 */
	private async attachSourceAuth(input: EverJobsSearchInput, tenantId?: string): Promise<void> {
		try {
			// Look for an Upwork config — the Ever Jobs API can forward
			// Upwork API credentials if available
			const upworkConfig = await this.sourceConfigService.getConfigForSource('upwork', undefined, tenantId); // the tenant's own credentials only
			if (upworkConfig?.clientId) {
				input.auth = {
					upwork: {
						grantType: upworkConfig.grantType,
						clientId: upworkConfig.clientId,
						clientSecret: upworkConfig.clientSecret,
						accessToken: upworkConfig.accessToken,
						refreshToken: upworkConfig.refreshToken,
					},
				};
				this.logger.log('Attached Upwork auth to search request');
			}
		} catch (authErr) {
			this.logger.warn(
				`Could not load source auth config: ${authErr instanceof Error ? authErr.message : authErr}`,
			);
		}
	}

	/**
	 * Builds the Ever Jobs API search input from a criterion + global config.
	 * Criterion fields override global config where provided.
	 */
	private buildSearchInput(criterion: SearchCriterion): EverJobsSearchInput {
		const input: EverJobsSearchInput = {
			descriptionFormat: EverJobsDescriptionFormat.MARKDOWN,
		};

		// Global config: sites
		if (this.config.sites) {
			const siteList = this.config.sites
				.split(',')
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean);

			const validSites: EverJobsSite[] = [];
			for (const siteName of siteList) {
				const siteEnum = Object.values(EverJobsSite).find(
					(v) => v === siteName,
				);
				if (siteEnum) {
					validSites.push(siteEnum);
				} else {
					this.logger.warn(`Unknown Ever Jobs site: "${siteName}", skipping`);
				}
			}

			if (validSites.length > 0) {
				input.siteType = validSites;
			}
		}

		// Global config: resultsWanted
		if (this.config.resultsWanted) {
			input.resultsWanted = Number(this.config.resultsWanted);
		}

		// Criterion fields
		if (criterion.keyword) {
			input.searchTerm = criterion.keyword;
		}

		if (criterion.location) {
			input.location = criterion.location;
		}

		if (criterion.country) {
			input.country = criterion.country;
		}

		if (criterion.isRemote != null) {
			input.isRemote = criterion.isRemote;
		}

		if (criterion.hoursOld) {
			input.hoursOld = Number(criterion.hoursOld);
		}

		return input;
	}

	/**
	 * The posts with a URL that came through Ever Jobs (`ingestedBy = 'ever-jobs'`; rows without
	 * `ingestedBy` by their `providerCode`, as before), except Upwork postings: those are verified
	 * only through Upwork's official API (the Upwork provider), never by requesting upwork.com.
	 */
	canVerify(job: LivenessJob): boolean {
		return !!job.url && (job.ingestedBy ?? job.providerCode) === this.providerCode && job.providerCode !== UPWORK_SITE && !isUpworkUrl(job.url);
	}

	/**
	 * Verify whether a job posting is still live/open: a HEAD request to the stored URL, looking for
	 * 404/410 or a redirect to a "closed" page. The URL is stored data that any tenant can submit, so
	 * the request has the guards a server-side request needs: public addresses only (resolved once,
	 * the connection pinned to the validated address) and no redirect followed — a redirect's target
	 * is only inspected for the closed-page patterns. Upwork pages are never requested (Upwork's
	 * terms: its official API only). A refused URL, a network error, a redirect elsewhere or an
	 * unexpected status is no verdict (`verified: false`): it never closes the job, and the stored
	 * state is kept (the person is not blocked on a hiccup).
	 */
	async verifyJob(jobUrl: string, _job?: LivenessJob, net: { resolve?: Resolver; request?: PinnedRequest } = {}): Promise<LivenessResult> {
		if (isUpworkUrl(jobUrl)) {
			return { isOpen: true, verified: false, reason: 'Not verified: Upwork postings are checked through the official Upwork API only' };
		}
		const deadline = AbortSignal.timeout(10_000);
		let target: PublicTarget;
		try {
			target = await resolvePublicUrl(jobUrl, { resolve: net.resolve, signal: deadline });
		} catch (error) {
			if (!(error instanceof UnsafeUrlError)) throw error;
			this.logger.warn(`verifyJob refused ${jobUrl}: ${error.message}`);
			return { isOpen: true, verified: false, reason: `Not verified: ${error.message}` };
		}
		try {
			const response = await (net.request ?? pinnedRequest)(target.url, target.address, {
				method: 'HEAD',
				headers: { 'user-agent': 'Mozilla/5.0 (compatible; Gauzy-AI/1.0)' },
				signal: deadline,
			});
			response.abort(); // HEAD: the status and headers are all there is to read

			// 404/410 = job no longer exists
			if (response.status === 404 || response.status === 410) {
				return { isOpen: false, reason: `HTTP ${response.status} — job page not found` };
			}
			if (response.status >= 300 && response.status < 400) {
				// not followed: a redirect to a generic "job closed" or search page means the job is gone
				const location = response.headers.location ?? '';
				if (isClosedPage(location)) {
					return { isOpen: false, reason: `Redirected to closed/expired page: ${location}` };
				}
				return { isOpen: true, verified: false, reason: `Redirected (not followed): ${location || 'no location'}` };
			}
			if (response.status >= 200 && response.status < 300) {
				return { isOpen: true };
			}
			return { isOpen: true, verified: false, reason: `Unexpected HTTP ${response.status}` }; // no verdict if we can't tell
		} catch (error) {
			this.logger.warn(`verifyJob failed for ${jobUrl}: ${error instanceof Error ? error.message : error}`);
			// On network error, no verdict: the job keeps its state (don't block the user)
			return { isOpen: true, verified: false, reason: `Verification failed: ${error instanceof Error ? error.message : 'unknown error'}` };
		}
	}
}

/** Many platforms redirect expired jobs to a search or "not found" page. */
const CLOSED_PAGE_PATTERNS = ['/job-not-found', '/expired', '/closed', '/404', '/search'];
const isClosedPage = (url: string): boolean => CLOSED_PAGE_PATTERNS.some((pattern) => url.toLowerCase().includes(pattern));

/** Ever Jobs' site code for Upwork; such posts belong to the official-API verifier. */
const UPWORK_SITE = 'upwork';

/** upwork.com or a subdomain: never requested from here (Upwork's terms allow its official API only). */
const isUpworkUrl = (url?: string): boolean => {
	if (!url) return false;
	try {
		const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
		return host === 'upwork.com' || host.endsWith('.upwork.com');
	} catch {
		return false;
	}
};
