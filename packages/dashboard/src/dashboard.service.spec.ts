// Every scoped lookup takes the tenant from the request context: pin it for the specs.
jest.mock('@packages/core/context', () => ({
	currentTenantWhere: () => ({ tenantId: 'tenant-1' }),
	requireCurrentTenantId: () => 'tenant-1',
	resolveTenantId: (requested?: string) => {
		if (requested && requested !== 'tenant-1') throw new Error('tenantId does not match the authenticated tenant');
		return 'tenant-1';
	},
	RequestContext: { currentTenantId: () => 'tenant-1' },
}));
// tenant-scope mock above
import { DashboardService } from './dashboard.service';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { EmployeeJobPost } from '@packages/entities/employeeJobPost.entity';

describe('DashboardService', () => {
	let service: DashboardService;
	let repo: jest.Mocked<Partial<Repository<EmployeeJobPost>>>;
	let mockQb: any;

	beforeEach(() => {
		mockQb = {
			select: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			getRawOne: jest.fn().mockResolvedValue({ avg: '82.5' }),
			getCount: jest.fn().mockResolvedValue(3),
		};

		repo = {
			count: jest.fn().mockResolvedValue(25),
			findOne: jest.fn().mockResolvedValue(null),
			find: jest.fn().mockResolvedValue([]),
			createQueryBuilder: jest.fn().mockReturnValue(mockQb),
		};

		service = new DashboardService(repo as any);
		// Can also inject the mock repo via reflection for overrides
		(service as any).ejpRepo = repo;
	});

	describe('getStats', () => {
		it('should return correct total matches count', async () => {
			repo.count.mockResolvedValueOnce(42);
			const stats = await service.getStats();
			expect(stats.totalMatches).toBe(42);
		});

		it('should return correct total applications count', async () => {
			repo.count
				.mockResolvedValueOnce(100) // totalMatches
				.mockResolvedValueOnce(15)  // totalApplications
				.mockResolvedValueOnce(5)   // matchesToday
				.mockResolvedValueOnce(2);  // applicationsSentToday
			const stats = await service.getStats();
			expect(stats.totalApplications).toBe(15);
		});

		it('should compute average match score from query', async () => {
			mockQb.getRawOne.mockResolvedValue({ avg: '78.3' });
			const stats = await service.getStats();
			expect(stats.avgMatchScore).toBeCloseTo(78.3);
		});

		it('should return null avgMatchScore when no scored matches exist', async () => {
			mockQb.getRawOne.mockResolvedValue({ avg: null });
			const stats = await service.getStats();
			expect(stats.avgMatchScore).toBeNull();
		});

		it('should return topScoringMatch when a match exists', async () => {
			repo.findOne.mockResolvedValue({
				matchScore: 95,
				providerCode: 'linkedin',
				jobPost: { title: 'Senior Dev' },
			} as any);
			const stats = await service.getStats();
			expect(stats.topScoringMatch).toEqual({
				jobTitle: 'Senior Dev',
				matchScore: 95,
				providerCode: 'linkedin',
			});
		});

		it('should return null topScoringMatch when no matches exist', async () => {
			repo.findOne.mockResolvedValue(null);
			const stats = await service.getStats();
			expect(stats.topScoringMatch).toBeNull();
		});

		it('should compute score distribution across 5 buckets', async () => {
			// 5 buckets, getCount called for each
			mockQb.getCount
				.mockResolvedValueOnce(2)   // 0-29
				.mockResolvedValueOnce(5)   // 30-49
				.mockResolvedValueOnce(10)  // 50-69
				.mockResolvedValueOnce(15)  // 70-89
				.mockResolvedValueOnce(8);  // 90-100

			const stats = await service.getStats();
			expect(stats.scoreDistribution).toHaveLength(5);
			expect(stats.scoreDistribution[0]).toEqual({ range: '0-29', count: 2 });
			expect(stats.scoreDistribution[4]).toEqual({ range: '90-100', count: 8 });
		});

		it('should pass employeeId filter when provided', async () => {
			await service.getStats('emp-123');
			expect(repo.count).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ employeeId: 'emp-123' }),
				})
			);
		});

		it('always scopes by the authenticated tenant', async () => {
			await service.getStats();
			expect(repo.count).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ tenantId: 'tenant-1' }),
				})
			);
		});

		it('accepts the own tenantId and refuses another tenant', async () => {
			await service.getStats(undefined, 'tenant-1');
			expect(repo.count).toHaveBeenCalledWith(
				expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
			);
			await expect(service.getStats(undefined, 'tenant-abc')).rejects.toThrow('does not match the authenticated tenant');
		});

		it('should combine recent matches and applications sorted by timestamp', async () => {
			const now = new Date();
			const earlier = new Date(now.getTime() - 3600000);

			repo.find
				.mockResolvedValueOnce([
					{ jobPost: { title: 'Job A' }, matchScore: 90, createdAt: earlier } as any,
				])
				.mockResolvedValueOnce([
					{ jobPost: { title: 'Job B' }, appliedDate: now, updatedAt: now } as any,
				]);

			const stats = await service.getStats();
			expect(stats.recentActivity).toHaveLength(2);
			expect(stats.recentActivity[0].type).toBe('application');
			expect(stats.recentActivity[1].type).toBe('match');
		});
	});
});
