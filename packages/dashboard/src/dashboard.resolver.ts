import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { DashboardService } from './dashboard.service';
import { DashboardStats } from './dto/dashboardStats.type';

@Resolver(() => DashboardStats)
export class DashboardResolver {
	constructor(private readonly dashboardService: DashboardService) {}

	@Query(() => DashboardStats, {
		name: 'dashboardStats',
		// the description the schema has always published (the query used to be declared twice)
		description: 'Dashboard statistics — matches, applications, scores, activity feed',
	})
	async dashboardStats(
		@Args('employeeId', { type: () => ID, nullable: true }) employeeId?: string,
		@Args('tenantId', { type: () => ID, nullable: true }) tenantId?: string,
	): Promise<DashboardStats> {
		return this.dashboardService.getStats(employeeId, tenantId);
	}
}
