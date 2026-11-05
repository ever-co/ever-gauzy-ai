import { EverJobsMapperService } from './ever-jobs-mapper.service';
import { EverJobsJobPost } from '@packages/ever-jobs-client';
import { JobPost } from '@packages/entities';

describe('EverJobsMapperService', () => {
	let mapper: EverJobsMapperService;

	beforeEach(() => {
		mapper = new EverJobsMapperService();
	});

	const fullDto: EverJobsJobPost = {
		id: 'job-123',
		title: 'Senior React Developer',
		companyName: 'Acme Corp',
		jobUrl: 'https://example.com/job/123',
		jobUrlDirect: 'https://example.com/apply/123',
		location: { city: 'San Francisco', state: 'CA', country: 'USA' },
		description: 'We are looking for a senior React developer.',
		companyUrl: 'https://acme.com',
		companyUrlDirect: 'https://acme.com/careers',
		jobType: ['fulltime' as any],
		compensation: {
			minAmount: 50,
			maxAmount: 80,
			interval: 'hourly',
			currency: 'USD',
		},
		datePosted: '2024-06-15T12:00:00Z',
		emails: ['jobs@acme.com'],
		isRemote: true,
		listingType: 'organic',
		jobLevel: 'Mid-Senior level',
		companyIndustry: 'Technology',
		companyAddresses: '123 Main St',
		companyNumEmployees: '1000-5000',
		companyRevenue: '$100M-$500M',
		companyDescription: 'Leading tech company',
		companyLogo: 'https://acme.com/logo.png',
		bannerPhotoUrl: 'https://acme.com/banner.png',
		jobFunction: 'Engineering',
		skills: ['React', 'TypeScript', 'Node.js'],
		experienceRange: '5-8 years',
		companyRating: 4.5,
		companyReviewsCount: 200,
		vacancyCount: 3,
		workFromHomeType: 'fully_remote',
		salarySource: 'glassdoor',
		department: 'Product Engineering',
		team: 'Frontend',
		atsId: 'gh-456',
		atsType: 'greenhouse',
		employmentType: 'Full-Time',
		applyUrl: 'https://apply.example.com/123',
		site: 'linkedin',
	};

	describe('mapOne', () => {
		it('should map all core fields correctly', () => {
			const result = mapper.mapOne(fullDto, 'react developer');

			expect(result).not.toBeNull();
			expect(result.providerCode).toBe('linkedin');
			expect(result.providerJobId).toBe('linkedin-job-123');
			// the site code says where the posting is; ingestedBy says it came through Ever Jobs
			expect(result.ingestedBy).toBe('ever-jobs');
			expect(result.title).toBe('Senior React Developer');
			expect(result.description).toBe('We are looking for a senior React developer.');
		});

		it('should map date fields', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.jobDateCreated).toBeInstanceOf(Date);
			expect(result.jobDateCreated.toISOString()).toBe('2024-06-15T12:00:00.000Z');
		});

		it('should map URL fields', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.url).toBe('https://example.com/job/123');
			expect(result.sourceUrl).toBe('https://apply.example.com/123');
		});

		it('should map job type', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.jobType).toBe('Full Time');
		});

		it('should map compensation correctly', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.budget).toBe('50-80/ho');
			expect(result.compensationMin).toBe(50);
			expect(result.compensationMax).toBe(80);
			expect(result.compensationCurrency).toBe('USD');
			expect(result.compensationInterval).toBe('hourly');
		});

		it('should map location fields', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.country).toBe('USA');
			expect(result.location).toBe('San Francisco, CA, USA');
		});

		it('should map company info', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.companyName).toBe('Acme Corp');
			expect(result.companyUrl).toBe('https://acme.com');
		});

		it('should map remote flag', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.isRemote).toBe(true);
		});

		it('should map skills', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.skills).toBe('React, TypeScript, Node.js');
		});

		it('should map search metadata', () => {
			const result = mapper.mapOne(fullDto, 'react developer');

			expect(result.searchCategory).toBe('linkedin');
			expect(result.searchKeyword).toBe('react developer');
		});

		it('should map company enrichment fields', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.companyIndustry).toBe('Technology');
			expect(result.companyLogo).toBe('https://acme.com/logo.png');
			expect(result.companyDescription).toBe('Leading tech company');
			expect(result.companyNumEmployees).toBe('1000-5000');
			expect(result.companyRating).toBe(4.5);
		});

		it('should map job metadata fields', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.jobLevel).toBe('Mid-Senior level');
			expect(result.jobFunction).toBe('Engineering');
			expect(result.listingType).toBe('organic');
			expect(result.experienceRange).toBe('5-8 years');
			expect(result.bannerPhotoUrl).toBe('https://acme.com/banner.png');
		});

		it('should map ATS metadata fields', () => {
			const result = mapper.mapOne(fullDto);

			expect(result.department).toBe('Product Engineering');
			expect(result.team).toBe('Frontend');
			expect(result.atsType).toBe('greenhouse');
			expect(result.atsId).toBe('gh-456');
			expect(result.employmentType).toBe('Full-Time');
		});

		it('should return null for job with missing title', () => {
			const result = mapper.mapOne({ ...fullDto, title: '' } as any);

			expect(result).toBeNull();
		});

		it('should return null for null/undefined DTO', () => {
			expect(mapper.mapOne(null as any)).toBeNull();
			expect(mapper.mapOne(undefined as any)).toBeNull();
		});

		it('should handle empty/minimal DTO', () => {
			const minimalDto: EverJobsJobPost = {
				title: 'Simple Job',
				jobUrl: 'https://example.com/job',
			};

			const result = mapper.mapOne(minimalDto);

			expect(result).not.toBeNull();
			expect(result.title).toBe('Simple Job');
			expect(result.providerCode).toBe('ever-jobs');
			expect(result.ingestedBy).toBe('ever-jobs');
			expect(result.description).toBe('');
			expect(result.companyName).toBeUndefined();
			expect(result.companyIndustry).toBeUndefined();
			expect(result.jobLevel).toBeUndefined();
			expect(result.department).toBeUndefined();
		});

		it('should fallback to jobUrlDirect for URL when jobUrl absent', () => {
			const dto: EverJobsJobPost = {
				title: 'Test Job',
				jobUrl: '',
				jobUrlDirect: 'https://direct.example.com',
			};

			const result = mapper.mapOne(dto);

			expect(result.url).toBe('https://direct.example.com');
		});

		it('should fallback to companyUrlDirect when companyUrl is absent', () => {
			const dto: EverJobsJobPost = {
				title: 'Test Job',
				jobUrl: 'https://example.com/123',
				companyUrlDirect: 'https://company-direct.example.com',
			};

			const result = mapper.mapOne(dto);

			expect(result.companyUrl).toBe('https://company-direct.example.com');
		});

		it('should handle location with partial fields', () => {
			const dto: EverJobsJobPost = {
				title: 'Test Job',
				jobUrl: 'https://example.com',
				location: { city: 'Berlin', state: null, country: 'Germany' },
			};

			const result = mapper.mapOne(dto);

			expect(result.location).toBe('Berlin, Germany');
			expect(result.country).toBe('Germany');
		});

		it('should handle budget with single amount', () => {
			const dto: EverJobsJobPost = {
				title: 'Fixed Rate Job',
				jobUrl: 'https://example.com',
				compensation: { minAmount: 5000, maxAmount: 5000, interval: 'fixed' },
			};

			const result = mapper.mapOne(dto);

			expect(result.budget).toBe('5000');
		});

		it('should generate hash-based providerJobId when id is missing', () => {
			const dto: EverJobsJobPost = {
				title: 'No-ID Job',
				jobUrl: 'https://example.com/unique-path',
				site: 'indeed',
			};

			const result = mapper.mapOne(dto);

			expect(result.providerJobId).toMatch(/^indeed-\w+$/);
		});
	});

	describe('mapMany', () => {
		it('should map multiple jobs and filter nulls', () => {
			const jobs: EverJobsJobPost[] = [
				fullDto,
				{ title: '', jobUrl: 'bad' } as any, // will be null
				{ ...fullDto, id: 'job-456', title: 'Another Job' },
			];

			const results = mapper.mapMany(jobs, 'developer');

			expect(results).toHaveLength(2);
			expect(results[0].title).toBe('Senior React Developer');
			expect(results[1].title).toBe('Another Job');
			expect(results[0].searchKeyword).toBe('developer');
		});

		it('should return empty array for empty input', () => {
			expect(mapper.mapMany([])).toEqual([]);
		});

		it('should return empty array when all jobs are invalid', () => {
			const jobs = [
				{ title: '' } as any,
				null as any,
			];

			const results = mapper.mapMany(jobs);

			expect(results).toEqual([]);
		});
	});
});
