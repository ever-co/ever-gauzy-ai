import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

describe('DashboardResolver', () => {
	let resolver: DashboardResolver;
	let service: Partial<DashboardService>;

	const mockStats = {
		totalMatches: 42,
		totalApplications: 10,
		avgMatchScore: 78.5,
		matchesToday: 5,
		applicationsSentToday: 2,
		topScoringMatch: { jobTitle: 'Dev', matchScore: 95 },
		scoreDistribution: [{ range: '90-100', count: 8 }],
		recentActivity: [{ type: 'match', description: 'Matched "Dev"', timestamp: new Date() }],
	};

	beforeEach(() => {
		service = {
			getStats: jest.fn().mockResolvedValue(mockStats),
		};
		resolver = new DashboardResolver(service as DashboardService);
	});

	it('should return dashboard stats without filters', async () => {
		const result = await resolver.dashboardStats();
		expect(service.getStats).toHaveBeenCalledWith(undefined, undefined);
		expect(result).toEqual(mockStats);
	});

	it('should pass employeeId to service', async () => {
		await resolver.dashboardStats('emp-1');
		expect(service.getStats).toHaveBeenCalledWith('emp-1', undefined);
	});

	it('should pass tenantId to service', async () => {
		await resolver.dashboardStats(undefined, 'tenant-1');
		expect(service.getStats).toHaveBeenCalledWith(undefined, 'tenant-1');
	});

	it('should pass both employeeId and tenantId to service', async () => {
		await resolver.dashboardStats('emp-1', 'tenant-1');
		expect(service.getStats).toHaveBeenCalledWith('emp-1', 'tenant-1');
	});
});
