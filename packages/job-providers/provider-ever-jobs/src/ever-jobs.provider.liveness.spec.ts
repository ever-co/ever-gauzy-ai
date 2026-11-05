import { EverJobsProvider } from './ever-jobs.provider';

describe('EverJobsProvider.verifyJob (liveness check of a stored job URL)', () => {
	const provider = new EverJobsProvider({} as any, {} as any, {} as any, {} as any);
	const resolve = jest.fn(async (hostname: string) => {
		if (hostname === 'jobs.example.com') return ['93.184.216.34'];
		if (hostname === 'internal.example.com') return ['10.0.0.5'];
		return [];
	});
	const request = jest.fn();
	const answer = (status: number, headers: Record<string, string> = {}) => ({ status, headers, body: (async function* () {})(), abort: jest.fn() });

	beforeEach(() => {
		request.mockReset();
		resolve.mockClear();
	});

	it('refuses private, local and unresolvable targets without sending anything: no verdict', async () => {
		await expect(provider.verifyJob('http://127.0.0.1/admin', undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: expect.stringMatching(/private or local/) });
		await expect(provider.verifyJob('https://internal.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: expect.stringMatching(/private or local/) });
		await expect(provider.verifyJob('https://nope.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: expect.stringMatching(/cannot be resolved/) });
		await expect(provider.verifyJob('ftp://jobs.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: expect.stringMatching(/http\(s\)/) });
		expect(request).not.toHaveBeenCalled();
	});

	it('sends one HEAD request pinned to the validated address and reads the status', async () => {
		request.mockResolvedValueOnce(answer(200));
		await expect(provider.verifyJob('https://jobs.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: true });
		const [url, address, init] = request.mock.calls[0];
		expect(url.href).toBe('https://jobs.example.com/job/1');
		expect(address).toBe('93.184.216.34');
		expect(init.method).toBe('HEAD');
		expect(init.signal).toBeInstanceOf(AbortSignal);

		request.mockResolvedValueOnce(answer(410));
		await expect(provider.verifyJob('https://jobs.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: false, reason: 'HTTP 410 — job page not found' });
	});

	it('never follows a redirect: the target is only inspected for a closed page', async () => {
		request.mockResolvedValueOnce(answer(302, { location: 'https://jobs.example.com/job-not-found' }));
		await expect(provider.verifyJob('https://jobs.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({
			isOpen: false,
			reason: 'Redirected to closed/expired page: https://jobs.example.com/job-not-found',
		});
		expect(request).toHaveBeenCalledTimes(1);

		request.mockResolvedValueOnce(answer(301, { location: 'http://10.0.0.5/' }));
		await expect(provider.verifyJob('https://jobs.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: 'Redirected (not followed): http://10.0.0.5/' });
		expect(request).toHaveBeenCalledTimes(2); // the private target was not requested
	});

	it('a network failure or an unexpected status is no verdict, with the reason', async () => {
		request.mockRejectedValueOnce(new Error('socket hang up'));
		await expect(provider.verifyJob('https://jobs.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: 'Verification failed: socket hang up' });
		request.mockResolvedValueOnce(answer(503));
		await expect(provider.verifyJob('https://jobs.example.com/job/1', undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: 'Unexpected HTTP 503' });
	});

	it('never requests an Upwork page (official API only): no verdict, nothing resolved or sent', async () => {
		for (const url of ['https://www.upwork.com/jobs/~01abc', 'https://UPWORK.com/freelance-jobs/apply/x', 'https://upwork.com./jobs/~02']) {
			await expect(provider.verifyJob(url, undefined, { resolve, request })).resolves.toEqual({ isOpen: true, verified: false, reason: expect.stringMatching(/official Upwork API/) });
		}
		expect(resolve).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
});

describe('EverJobsProvider.canVerify (which stored posts it verifies)', () => {
	const provider = new EverJobsProvider({} as any, {} as any, {} as any, {} as any);
	const post = (fields: Record<string, unknown>) => ({ providerCode: 'linkedin', ingestedBy: 'ever-jobs', url: 'https://www.linkedin.com/jobs/view/1', ...fields }) as any;

	it('claims the posts it stored, whatever site code they carry', () => {
		expect(provider.canVerify(post({}))).toBe(true);
		expect(provider.canVerify(post({ providerCode: 'indeed', url: 'https://www.indeed.com/viewjob?jk=1' }))).toBe(true);
		expect(provider.canVerify(post({ providerCode: 'ever-jobs', ingestedBy: null }))).toBe(true); // a row without ingestedBy: by its code, as before
	});

	it('leaves Upwork postings to the official API provider and other channels to their providers', () => {
		expect(provider.canVerify(post({ providerCode: 'upwork', url: 'https://www.upwork.com/jobs/~01abc' }))).toBe(false);
		expect(provider.canVerify(post({ providerCode: 'other-board', url: 'https://www.upwork.com/jobs/~01abc' }))).toBe(false);
		expect(provider.canVerify(post({ providerCode: 'upwork', ingestedBy: 'upwork' }))).toBe(false);
		expect(provider.canVerify(post({ ingestedBy: null }))).toBe(false); // linkedin, stored by no provider
		expect(provider.canVerify(post({ url: undefined }))).toBe(false); // nothing to send a HEAD request to
	});
});
