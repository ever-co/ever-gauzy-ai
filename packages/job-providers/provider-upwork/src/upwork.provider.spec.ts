import { UpworkProvider, UPWORK_JOB_STATE_QUERY, UPWORK_SEARCH_QUERY } from './upwork.provider';

const jsonResponse = (body: unknown, status = 200) =>
	({ ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', json: async () => body }) as unknown as Response;

describe('UpworkProvider (official API)', () => {
	const fetchFn = jest.fn();
	const sourceConfigService = { getConfigForSource: jest.fn() };
	const build = (config: Record<string, unknown> = {}) =>
		new UpworkProvider({ apiUrl: 'https://api.test/graphql', tokenUrl: 'https://auth.test/token', resultsWanted: 10, ...config } as any, sourceConfigService as any, fetchFn as any);
	const searchResponse = {
		data: {
			marketplaceJobPostingsSearch: {
				totalCount: 1,
				edges: [
					{
						node: {
							id: 'job-1',
							title: 'React developer',
							description: 'Build a dashboard',
							ciphertext: '~01abc',
							publishedDateTime: '2026-10-30T10:00:00Z',
							category: 'Web Development',
							skills: [{ name: 'React' }, { name: 'TypeScript' }],
							hourlyBudgetMin: { rawValue: '30', currencyCode: 'USD' },
							hourlyBudgetMax: { rawValue: '60', currencyCode: 'USD' },
							job: { contractTerms: { contractType: 'HOURLY' } },
							client: { location: { country: 'Germany', city: 'Berlin' }, totalFeedback: 4.9, totalReviews: 12, totalPostedJobs: 20, totalHires: 15, verificationStatus: 'VERIFIED' },
						},
					},
					{ node: { id: 'job-2', description: 'no title → skipped' } },
				],
			},
		},
	};

	beforeEach(() => {
		jest.resetAllMocks();
		sourceConfigService.getConfigForSource.mockResolvedValue(null);
	});

	it('stays eligible for dispatch but fetches nothing without credentials', async () => {
		const provider = build();
		expect(await provider.isEnabled()).toBe(true);
		expect(await provider.getJobsForCriteria({ keyword: 'react' })).toEqual([]);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('obtains a client-credentials token once, searches with the criterion and maps the postings', async () => {
		fetchFn
			.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 }))
			.mockResolvedValueOnce(jsonResponse(searchResponse))
			.mockResolvedValueOnce(jsonResponse(searchResponse));
		const provider = build({ clientId: 'id', clientSecret: 'secret', organizationId: 'org-1' });
		expect(await provider.isEnabled()).toBe(true);

		const jobs = await provider.getJobsForCriteria({ keyword: 'react', jobType: 'Hourly' });

		// token request
		const [tokenUrl, tokenInit] = fetchFn.mock.calls[0];
		expect(tokenUrl).toBe('https://auth.test/token');
		expect(String(tokenInit.body)).toContain('grant_type=client_credentials');
		expect(String(tokenInit.body)).toContain('client_secret=secret');
		// search request
		const [apiUrl, searchInit] = fetchFn.mock.calls[1];
		expect(apiUrl).toBe('https://api.test/graphql');
		expect(searchInit.headers.Authorization).toBe('Bearer tok');
		expect(searchInit.headers['X-Upwork-API-TenantId']).toBe('org-1');
		const body = JSON.parse(searchInit.body);
		expect(body.query).toBe(UPWORK_SEARCH_QUERY);
		expect(body.variables).toEqual({ filter: { searchExpression_eq: 'react', jobType_eq: 'HOURLY' }, pagination: { first: 10 } });
		// mapping
		expect(jobs).toHaveLength(1);
		expect(jobs[0]).toMatchObject({
			providerCode: 'upwork',
			providerJobId: 'job-1',
			ingestedBy: 'upwork', // the official API, told apart from Ever Jobs' Upwork posts (same providerCode)
			title: 'React developer',
			url: 'https://www.upwork.com/jobs/~01abc',
			jobType: 'hourly',
			compensationMin: 30,
			compensationMax: 60,
			compensationCurrency: 'USD',
			budget: '$30-$60/hr',
			skills: 'React, TypeScript',
			country: 'Germany',
			location: 'Berlin, Germany',
			clientReviewsCount: 12,
			clientPaymentVerificationStatus: true,
			searchKeyword: 'react',
			isActive: true,
		});
		expect(jobs[0].jobDateCreated).toEqual(new Date('2026-10-30T10:00:00Z'));

		expect(tokenInit.signal).toBeInstanceOf(AbortSignal); // deadline on the token request
		expect(searchInit.signal).toBeInstanceOf(AbortSignal); // and on the search
		// the token is cached for the next search
		await provider.getJobsForCriteria({ keyword: 'node' });
		expect(fetchFn).toHaveBeenCalledTimes(3);
		expect(fetchFn.mock.calls[2][0]).toBe('https://api.test/graphql');
	});

	it('keeps a minimum-only hourly posting open-ended (no synthesized maximum)', async () => {
		const node = { ...searchResponse.data.marketplaceJobPostingsSearch.edges[0].node, id: 'job-3', hourlyBudgetMax: null };
		fetchFn
			.mockResolvedValueOnce(jsonResponse({ access_token: 'tok', expires_in: 3600 }))
			.mockResolvedValueOnce(jsonResponse({ data: { marketplaceJobPostingsSearch: { edges: [{ node }] } } }));
		const [job] = await build({ clientId: 'id', clientSecret: 'secret' }).getJobsForCriteria({ keyword: 'react' });
		expect(job).toMatchObject({ jobType: 'hourly', compensationMin: 30, compensationCurrency: 'USD', budget: 'from $30/hr' });
		expect(job.compensationMax).toBeUndefined();
	});

	it('does not reuse a cached token for a different secret of the same client id', async () => {
		sourceConfigService.getConfigForSource
			.mockResolvedValueOnce({ clientId: 'id', clientSecret: 'secret-A' })
			.mockResolvedValueOnce({ clientId: 'id', clientSecret: 'secret-B' });
		fetchFn
			.mockResolvedValueOnce(jsonResponse({ access_token: 'tok-A', expires_in: 3600 }))
			.mockResolvedValueOnce(jsonResponse({ data: { marketplaceJobPostingsSearch: { edges: [] } } }))
			.mockResolvedValueOnce(jsonResponse({ access_token: 'tok-B', expires_in: 3600 }))
			.mockResolvedValueOnce(jsonResponse({ data: { marketplaceJobPostingsSearch: { edges: [] } } }));
		const provider = build();
		await provider.getJobsForCriteria({ keyword: 'a', tenantId: 't-A' });
		await provider.getJobsForCriteria({ keyword: 'b', tenantId: 't-B' });
		expect(fetchFn).toHaveBeenCalledTimes(4); // two token requests, one per secret
		expect(fetchFn.mock.calls[3][1].headers.Authorization).toBe('Bearer tok-B');
	});

	it('prefers the tenant source config (pre-obtained token) over the environment fallback', async () => {
		sourceConfigService.getConfigForSource.mockResolvedValue({ accessToken: 'stored-token', sourceOrgId: 'org-db' });
		fetchFn.mockResolvedValueOnce(jsonResponse({ data: { marketplaceJobPostingsSearch: { edges: [] } } }));
		const provider = build({ clientId: 'id', clientSecret: 'secret' });
		await provider.getJobsForCriteria({ keyword: 'react', tenantId: 'tenant-1' });
		expect(fetchFn).toHaveBeenCalledTimes(1); // no token request
		expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer stored-token');
		expect(fetchFn.mock.calls[0][1].headers['X-Upwork-API-TenantId']).toBe('org-db');
		expect(sourceConfigService.getConfigForSource).toHaveBeenCalledWith('upwork', undefined, 'tenant-1'); // the criterion's tenant, never another
	});

	it('surfaces API errors and skips searches without a keyword', async () => {
		const provider = build({ accessToken: 'tok' });
		expect(await provider.getJobsForCriteria({ location: 'Berlin' })).toEqual([]);
		fetchFn.mockResolvedValueOnce(jsonResponse({ errors: [{ message: 'rate limited' }] }));
		await expect(provider.getJobsForCriteria({ keyword: 'react' })).rejects.toThrow(/rate limited/);
		fetchFn.mockResolvedValueOnce(jsonResponse({}, 503));
		await expect(provider.getJobsForCriteria({ keyword: 'react' })).rejects.toThrow(/503/);
	});

	describe('liveness through the official API', () => {
		const POSTING_ID = '2056488576136638272';
		const JOB_URL = 'https://www.upwork.com/jobs/~01abc';
		const post = (fields: Record<string, unknown> = {}) => ({ id: 'jp-1', providerCode: 'upwork', providerJobId: POSTING_ID, ingestedBy: 'upwork', url: JOB_URL, ...fields }) as any;
		const state = (status: string | null, closeResult?: string) =>
			jsonResponse({ data: { marketplaceJobPosting: status ? { id: POSTING_ID, workFlowState: { status, closeResult } } : null } });
		const requestedUrls = () => fetchFn.mock.calls.map(([url]) => String(url));

		it('claims every Upwork posting, whichever provider stored it, and nothing else', () => {
			const provider = build();
			expect(provider.canVerify(post())).toBe(true);
			expect(provider.canVerify(post({ ingestedBy: 'ever-jobs', providerJobId: `upwork-upwork-${POSTING_ID}` }))).toBe(true);
			expect(provider.canVerify(post({ providerCode: 'linkedin', ingestedBy: 'ever-jobs' }))).toBe(false);
		});

		it('asks marketplaceJobPosting for the workflow state: ACTIVE keeps the job open, CLOSED closes it', async () => {
			fetchFn.mockResolvedValueOnce(state('ACTIVE')).mockResolvedValueOnce(state('CLOSED', '3'));
			const provider = build({ accessToken: 'env-token' });

			await expect(provider.verifyJob(JOB_URL, post())).resolves.toEqual({ isOpen: true });
			const [apiUrl, init] = fetchFn.mock.calls[0];
			expect(apiUrl).toBe('https://api.test/graphql');
			expect(init.method).toBe('POST');
			expect(init.headers.Authorization).toBe('Bearer env-token');
			expect(init.signal).toBeInstanceOf(AbortSignal); // UPWORK_TIMEOUT_MS deadline
			expect(JSON.parse(init.body)).toEqual({ query: UPWORK_JOB_STATE_QUERY, variables: { id: POSTING_ID } });

			await expect(provider.verifyJob(JOB_URL, post())).resolves.toEqual({ isOpen: false, reason: 'Closed on Upwork: expired after 30 days without activity' });
			expect(requestedUrls()).toEqual(['https://api.test/graphql', 'https://api.test/graphql']); // never the posting page
		});

		it('verifies an Upwork posting relayed by Ever Jobs by the posting id embedded in its providerJobId', async () => {
			fetchFn.mockResolvedValueOnce(state('CLOSED', '0'));
			const provider = build({ accessToken: 'env-token' });
			await expect(provider.verifyJob(JOB_URL, post({ ingestedBy: 'ever-jobs', providerJobId: `upwork-upwork-${POSTING_ID}` }))).resolves.toEqual({
				isOpen: false,
				reason: 'Closed on Upwork: filled (at least one contract)',
			});
			expect(JSON.parse(fetchFn.mock.calls[0][1].body).variables).toEqual({ id: POSTING_ID });
		});

		it("uses the first offered tenant (LivenessJob.tenantIds) with credentials of its own, before the deployment-wide ones", async () => {
			sourceConfigService.getConfigForSource.mockImplementation(async (_code: string, _org: unknown, tenantId?: string) =>
				tenantId === 't-2' ? { tenantId: 't-2', accessToken: 'tenant-2-token' } : { tenantId: null, accessToken: 'shared-token' }
			);
			fetchFn.mockResolvedValueOnce(state('ACTIVE'));
			const tenantIds = jest.fn(async () => ['t-1', 't-2']);
			await build().verifyJob(JOB_URL, post({ tenantIds }));
			expect(tenantIds).toHaveBeenCalledWith('upwork'); // only tenants with a usable upwork config of their own
			expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer tenant-2-token'); // t-1 has none of its own
		});

		it('falls back to the tenant-less source config, then UPWORK_*; without any it is not verifiable', async () => {
			sourceConfigService.getConfigForSource.mockResolvedValue({ tenantId: null, accessToken: 'shared-token' });
			fetchFn.mockResolvedValueOnce(state('ACTIVE'));
			await build().verifyJob(JOB_URL, post({ tenantIds: async () => ['t-1'] }));
			expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer shared-token');

			sourceConfigService.getConfigForSource.mockResolvedValue(null);
			fetchFn.mockClear();
			await expect(build().verifyJob(JOB_URL, post())).resolves.toEqual({ isOpen: true, verified: false, reason: 'Not verifiable: no Upwork API credentials' });
			expect(fetchFn).not.toHaveBeenCalled();
		});

		it('is no verdict without a posting id, on API errors or an unknown answer', async () => {
			const provider = build({ accessToken: 'env-token' });
			await expect(provider.verifyJob(JOB_URL)).resolves.toMatchObject({ verified: false, reason: 'Not verifiable: no Upwork posting id' });
			// an Ever Jobs id without an Upwork posting id in it (hash of the URL)
			await expect(provider.verifyJob(JOB_URL, post({ ingestedBy: 'ever-jobs', providerJobId: 'upwork-1x9zq' }))).resolves.toMatchObject({ verified: false });
			expect(fetchFn).not.toHaveBeenCalled();

			fetchFn.mockResolvedValueOnce(jsonResponse({ errors: [{ message: 'permission denied' }] }));
			await expect(provider.verifyJob(JOB_URL, post())).resolves.toEqual({ isOpen: true, verified: false, reason: 'Verification failed: Upwork API: permission denied' });
			fetchFn.mockResolvedValueOnce(jsonResponse({}, 429));
			await expect(provider.verifyJob(JOB_URL, post())).resolves.toMatchObject({ isOpen: true, verified: false, reason: expect.stringMatching(/429/) });
			fetchFn.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));
			await expect(provider.verifyJob(JOB_URL, post())).resolves.toMatchObject({ isOpen: true, verified: false });
			fetchFn.mockResolvedValueOnce(state(null));
			await expect(provider.verifyJob(JOB_URL, post())).resolves.toEqual({ isOpen: true, verified: false, reason: `Not verified: Upwork returned no posting for ${POSTING_ID}` });
			expect(requestedUrls().every((url) => url === 'https://api.test/graphql')).toBe(true);
		});
	});
});
