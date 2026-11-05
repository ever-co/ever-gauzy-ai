import { ObjectType, Field, Float } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType({ description: 'System health status' })
export class HealthStatus {
	@Field(() => String, { description: 'Service status (ok | degraded | error)' })
	status: string;

	@Field(() => Float, { description: 'Process uptime in seconds' })
	uptime: number;

	@Field(() => String, { description: 'Application version' })
	version: string;

	@Field(() => Boolean, { description: 'Database connectivity status' })
	dbConnected: boolean;

	@Field(() => GraphQLISODateTime, { description: 'Current server timestamp' })
	timestamp: Date;
}
