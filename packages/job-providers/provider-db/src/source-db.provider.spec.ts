import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SourceDbProvider, SourceDbProviderConfig } from './source-db.provider';
import { SOURCE_DB_CONFIG } from './source-db.provider';
import { JobPost } from '@packages/entities/jobPost.entity';

describe('SourceDbProvider', () => {
	let provider: SourceDbProvider;
	let mockRepo: any;
	let mockQueryBuilder: any;

	const defaultConfig: SourceDbProviderConfig = {
		enabled: true,
		maxAgeHours: 72,
	};

	beforeEach(async () => {
		mockQueryBuilder = {
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			limit: jest.fn().mockReturnThis(),
			getMany: jest.fn().mockResolvedValue([]),
		};

		mockRepo = {
			createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SourceDbProvider,
				{
					provide: getRepositoryToken(JobPost),
					useValue: mockRepo,
				},
				{
					provide: SOURCE_DB_CONFIG,
					useValue: defaultConfig,
				},
			],
		}).compile();

		provider = module.get<SourceDbProvider>(SourceDbProvider);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('providerCode', () => {
		it('should have correct providerCode', () => {
			expect(provider.providerCode).toBe('source-db');
		});

		it('should have correct providerName', () => {
			expect(provider.providerName).toBe('Local Database Cache');
		});
	});

	describe('isEnabled', () => {
		it('should return true when enabled in config', async () => {
			expect(await provider.isEnabled()).toBe(true);
		});

		it('should return false when disabled in config', async () => {
			const module = await Test.createTestingModule({
				providers: [
					SourceDbProvider,
					{
						provide: getRepositoryToken(JobPost),
						useValue: mockRepo,
					},
					{
						provide: SOURCE_DB_CONFIG,
						useValue: { ...defaultConfig, enabled: false },
					},
				],
			}).compile();

			const disabledProvider = module.get<SourceDbProvider>(SourceDbProvider);
			expect(await disabledProvider.isEnabled()).toBe(false);
		});
	});

	describe('getJobs', () => {
		it('should query active, non-expired jobs within max age', async () => {
			const mockJobs = [
				{ id: '1', title: 'Job A', isActive: true },
				{ id: '2', title: 'Job B', isActive: true },
			];
			mockQueryBuilder.getMany.mockResolvedValue(mockJobs);

			const result = await provider.getJobs();

			expect(result).toHaveLength(2);
			expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('jp');

			// Should filter by isActive
			expect(mockQueryBuilder.where).toHaveBeenCalledWith(
				'jp.isActive = :isActive',
				{ isActive: true }
			);

			// Should filter by createdAt
			expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
				'jp.createdAt > :cutoffDate',
				expect.objectContaining({ cutoffDate: expect.any(Date) })
			);

			// Should filter by isExpired
			expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
				'(jp.isExpired IS NULL OR jp.isExpired = :notExpired)',
				{ notExpired: false }
			);

			// Should limit results
			expect(mockQueryBuilder.limit).toHaveBeenCalledWith(200);

			// Should order by newest first
			expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
				'jp.createdAt',
				'DESC'
			);
		});

		it('should return empty array on database error', async () => {
			mockQueryBuilder.getMany.mockRejectedValue(
				new Error('Connection refused')
			);

			const result = await provider.getJobs();

			expect(result).toEqual([]);
		});

		it('should use cutoff date based on maxAgeHours', async () => {
			const module = await Test.createTestingModule({
				providers: [
					SourceDbProvider,
					{
						provide: getRepositoryToken(JobPost),
						useValue: mockRepo,
					},
					{
						provide: SOURCE_DB_CONFIG,
						useValue: { ...defaultConfig, maxAgeHours: 24 },
					},
				],
			}).compile();

			const provider24h = module.get<SourceDbProvider>(SourceDbProvider);
			mockQueryBuilder.getMany.mockResolvedValue([]);

			await provider24h.getJobs();

			// Verify the cutoff date is approximately 24 hours ago
			const cutoffArg = mockQueryBuilder.andWhere.mock.calls[0][1];
			const cutoffDate = cutoffArg.cutoffDate as Date;
			const expectedCutoff = new Date();
			expectedCutoff.setHours(expectedCutoff.getHours() - 24);

			// Should be within 5 seconds of the expected cutoff
			const diffMs = Math.abs(cutoffDate.getTime() - expectedCutoff.getTime());
			expect(diffMs).toBeLessThan(5000);
		});

		it('should cap results at 200', async () => {
			mockQueryBuilder.getMany.mockResolvedValue([]);

			await provider.getJobs();

			expect(mockQueryBuilder.limit).toHaveBeenCalledWith(200);
		});
	});
});
