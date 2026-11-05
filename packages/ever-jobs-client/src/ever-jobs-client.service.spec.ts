import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse, AxiosHeaders } from 'axios';
import { EverJobsClientService } from './ever-jobs-client.service';

// Mock @nestjs/axios HttpService
const mockPost = jest.fn();
const mockHttpService = { post: mockPost } as any;

// Helper to create an AxiosResponse
function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
	return {
		data,
		status,
		statusText: 'OK',
		headers: {},
		config: { headers: new AxiosHeaders() },
	};
}

// Helper to create an AxiosError
function axiosError(status: number, data?: any): AxiosError {
	const err = new AxiosError('Request failed');
	err.response = {
		status,
		statusText: 'Error',
		data,
		headers: {},
		config: { headers: new AxiosHeaders() },
	} as any;
	return err;
}

describe('EverJobsClientService', () => {
	let service: EverJobsClientService;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should strip trailing slashes from apiUrl', () => {
			service = new EverJobsClientService(mockHttpService, {
				apiUrl: 'http://localhost:3001///',
			});
			// Verify by checking the URL used in a request
			mockPost.mockReturnValue(of(axiosResponse([])));
			service.searchJobs({ searchTerm: 'test' });
			expect(mockPost).toHaveBeenCalledWith(
				'http://localhost:3001/api/jobs/search',
				expect.anything(),
				expect.anything(),
			);
		});

		it('should use default timeout when not specified', () => {
			service = new EverJobsClientService(mockHttpService, {
				apiUrl: 'http://localhost:3001',
			});
			mockPost.mockReturnValue(of(axiosResponse([])));
			service.searchJobs({ searchTerm: 'test' });
			expect(mockPost).toHaveBeenCalledWith(
				expect.any(String),
				expect.anything(),
				expect.objectContaining({ timeout: 30_000 }),
			);
		});

		it('should use custom timeout when specified', () => {
			service = new EverJobsClientService(mockHttpService, {
				apiUrl: 'http://localhost:3001',
				timeout: 60_000,
			});
			mockPost.mockReturnValue(of(axiosResponse([])));
			service.searchJobs({ searchTerm: 'test' });
			expect(mockPost).toHaveBeenCalledWith(
				expect.any(String),
				expect.anything(),
				expect.objectContaining({ timeout: 60_000 }),
			);
		});
	});

	describe('searchJobs', () => {
		beforeEach(() => {
			service = new EverJobsClientService(mockHttpService, {
				apiUrl: 'http://localhost:3001',
				apiKey: 'test-key',
			});
		});

		it('should handle raw array response', async () => {
			const jobs = [{ title: 'Dev', jobUrl: 'http://a.com' }];
			mockPost.mockReturnValue(of(axiosResponse(jobs)));

			const result = await service.searchJobs({ searchTerm: 'developer' });
			expect(result).toEqual(jobs);
		});

		it('should handle wrapped { jobs: [...] } response', async () => {
			const jobs = [{ title: 'Dev', jobUrl: 'http://a.com' }];
			mockPost.mockReturnValue(of(axiosResponse({ count: 1, jobs, cached: false })));

			const result = await service.searchJobs({ searchTerm: 'developer' });
			expect(result).toEqual(jobs);
		});

		it('should return empty array for unexpected response shape', async () => {
			mockPost.mockReturnValue(of(axiosResponse({ unexpected: true })));

			const result = await service.searchJobs({ searchTerm: 'developer' });
			expect(result).toEqual([]);
		});

		it('should return empty array on rate limit (429)', async () => {
			mockPost.mockReturnValue(throwError(() => axiosError(429, { message: 'Rate limited' })));

			const result = await service.searchJobs({ searchTerm: 'developer' });
			expect(result).toEqual([]);
		});

		it('should return empty array on server error (500)', async () => {
			mockPost.mockReturnValue(throwError(() => axiosError(500, { error: 'Internal' })));

			const result = await service.searchJobs({ searchTerm: 'developer' });
			expect(result).toEqual([]);
		});

		it('should return empty array on generic Error', async () => {
			mockPost.mockReturnValue(throwError(() => new Error('Network failure')));

			const result = await service.searchJobs({ searchTerm: 'developer' });
			expect(result).toEqual([]);
		});

		it('should return empty array on unknown error type', async () => {
			mockPost.mockReturnValue(throwError(() => 'string error'));

			const result = await service.searchJobs({ searchTerm: 'developer' });
			expect(result).toEqual([]);
		});

		it('should include x-api-key header when apiKey is set', async () => {
			mockPost.mockReturnValue(of(axiosResponse([])));
			await service.searchJobs({ searchTerm: 'test' });

			expect(mockPost).toHaveBeenCalledWith(
				expect.any(String),
				expect.anything(),
				expect.objectContaining({
					headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
				}),
			);
		});
	});

	describe('analyzeJobs', () => {
		beforeEach(() => {
			service = new EverJobsClientService(mockHttpService, {
				apiUrl: 'http://localhost:3001',
			});
		});

		it('should return analysis data on success', async () => {
			const analysis = { totalJobs: 42, avgSalary: 100_000 };
			mockPost.mockReturnValue(of(axiosResponse(analysis)));

			const result = await service.analyzeJobs({ searchTerm: 'developer' });
			expect(result).toEqual(analysis);
		});

		it('should return null on error', async () => {
			mockPost.mockReturnValue(throwError(() => axiosError(500)));

			const result = await service.analyzeJobs({ searchTerm: 'developer' });
			expect(result).toBeNull();
		});

		it('should call POST /api/jobs/analyze', async () => {
			mockPost.mockReturnValue(of(axiosResponse({ totalJobs: 0 })));
			await service.analyzeJobs({ searchTerm: 'test' });

			expect(mockPost).toHaveBeenCalledWith(
				'http://localhost:3001/api/jobs/analyze',
				expect.anything(),
				expect.anything(),
			);
		});
	});

	describe('headers (no API key)', () => {
		it('should NOT include x-api-key when apiKey is not set', async () => {
			service = new EverJobsClientService(mockHttpService, {
				apiUrl: 'http://localhost:3001',
			});
			mockPost.mockReturnValue(of(axiosResponse([])));
			await service.searchJobs({ searchTerm: 'test' });

			const callHeaders = mockPost.mock.calls[0][2].headers;
			expect(callHeaders).toEqual({ 'Content-Type': 'application/json' });
			expect(callHeaders['x-api-key']).toBeUndefined();
		});
	});

	describe('handleError edge cases', () => {
		beforeEach(() => {
			service = new EverJobsClientService(mockHttpService, {
				apiUrl: 'http://localhost:3001',
			});
		});

		it('should handle 4xx errors with response body logging', async () => {
			mockPost.mockReturnValue(
				throwError(() => axiosError(422, { message: 'Validation failed', details: ['bad field'] })),
			);

			const result = await service.searchJobs({ searchTerm: 'test' });
			expect(result).toEqual([]);
		});

		it('should handle AxiosError without response (network error)', async () => {
			const err = new AxiosError('timeout');
			// No response property set
			mockPost.mockReturnValue(throwError(() => err));

			const result = await service.searchJobs({ searchTerm: 'test' });
			expect(result).toEqual([]);
		});
	});
});
