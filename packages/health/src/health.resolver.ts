import { Resolver, Query } from '@nestjs/graphql';
import { HealthService } from './health.service';
import { HealthStatus } from './health.type';

@Resolver(() => HealthStatus)
export class HealthResolver {
	constructor(private readonly healthService: HealthService) {}

	@Query(() => HealthStatus, {
		name: 'healthCheck',
		description: 'System health check — DB connectivity, uptime, version',
	})
	async healthCheck(): Promise<HealthStatus> {
		return this.healthService.check();
	}
}
