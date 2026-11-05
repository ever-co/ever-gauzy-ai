import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import type {
	EverJobsClientOptions,
	EverJobsSearchInput,
	EverJobsJobPost,
	EverJobsAnalysis,
} from './interfaces';

/**
 * HTTP client service for the Ever Jobs API.
 *
 * Wraps REST calls to POST /api/jobs/search and POST /api/jobs/analyze,
 * handling authentication, timeouts, and error mapping.
 */
@Injectable()
export class EverJobsClientService {
	private readonly logger = new Logger(EverJobsClientService.name);
	private readonly apiUrl: string;
	private readonly apiKey?: string;
	private readonly timeout: number;

	constructor(
		private readonly httpService: HttpService,
		private readonly options: EverJobsClientOptions,
	) {
		this.apiUrl = options.apiUrl.replace(/\/+$/, ''); // strip trailing slashes
		this.apiKey = options.apiKey;
		this.timeout = options.timeout ?? 30_000;

		this.logger.log(
			`EverJobsClientService initialized — API: ${this.apiUrl}, ` +
			`auth: ${this.apiKey ? 'api-key' : 'none'}, ` +
			`timeout: ${this.timeout}ms`,
		);
	}

	/**
	 * Search for jobs across multiple sources via the Ever Jobs API.
	 *
	 * @param input - Search parameters (sites, search term, location, etc.)
	 * @returns Array of job posts from the API
	 */
	async searchJobs(input: EverJobsSearchInput): Promise<EverJobsJobPost[]> {
		const url = `${this.apiUrl}/api/jobs/search`;

		this.logger.log(
			`Searching Ever Jobs: term="${input.searchTerm ?? ''}", ` +
			`sites=${input.siteType?.join(',') ?? 'all'}, ` +
			`results=${input.resultsWanted ?? 'default'}`,
		);

		try {
			const response = await firstValueFrom(
				this.httpService.post<any>(url, input, {
					headers: this.buildHeaders(),
					timeout: this.timeout,
				}),
			);

			// Ever Jobs API returns either:
			//   - wrapped: { count: N, jobs: [...], cached: bool }
			//   - raw array: [...]
			const data = response.data;
			let jobs: EverJobsJobPost[];

			if (Array.isArray(data)) {
				jobs = data;
			} else if (data?.jobs && Array.isArray(data.jobs)) {
				jobs = data.jobs;
			} else {
				this.logger.warn(
					`Unexpected Ever Jobs response shape: ${typeof data}. ` +
					`Keys: ${data ? Object.keys(data).join(', ') : 'null'}`,
				);
				jobs = [];
			}

			this.logger.log(`Ever Jobs returned ${jobs.length} job(s)`);
			return jobs;
		} catch (error) {
			this.handleError('searchJobs', error);
			return [];
		}
	}

	/**
	 * Analyze jobs via the Ever Jobs API.
	 *
	 * @param input - Search parameters for the analysis
	 * @returns Analysis results
	 */
	async analyzeJobs(input: EverJobsSearchInput): Promise<EverJobsAnalysis | null> {
		const url = `${this.apiUrl}/api/jobs/analyze`;

		this.logger.log(`Analyzing jobs via Ever Jobs API`);

		try {
			const response = await firstValueFrom(
				this.httpService.post<EverJobsAnalysis>(url, input, {
					headers: this.buildHeaders(),
					timeout: this.timeout,
				}),
			);

			return response.data ?? null;
		} catch (error) {
			this.handleError('analyzeJobs', error);
			return null;
		}
	}

	/**
	 * Build headers for API requests.
	 */
	private buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (this.apiKey) {
			headers['x-api-key'] = this.apiKey;
		}

		return headers;
	}

	/**
	 * Handle and log HTTP errors from the Ever Jobs API.
	 */
	private handleError(method: string, error: unknown): void {
		if (error instanceof AxiosError) {
			const status = error.response?.status;
			const data = error.response?.data;
			const message =
				data?.message ?? data?.detail ?? data?.error ?? error.message;

			if (status === 429) {
				this.logger.warn(
					`Ever Jobs API rate limit exceeded in ${method}: ${message}`,
				);
			} else if (status && status >= 500) {
				this.logger.error(
					`Ever Jobs API server error in ${method} (${status}): ${message}`,
				);
			} else {
				this.logger.error(
					`Ever Jobs API error in ${method} (${status ?? 'unknown'}): ${message}`,
				);
				// Log full response for 4xx to expose validation details
				if (data) {
					this.logger.error(
						`Ever Jobs API response body: ${JSON.stringify(data)}`,
					);
				}
			}
		} else if (error instanceof Error) {
			this.logger.error(
				`Error calling Ever Jobs API in ${method}: ${error.message}`,
			);
		} else {
			this.logger.error(
				`Unknown error calling Ever Jobs API in ${method}`,
			);
		}
	}
}
