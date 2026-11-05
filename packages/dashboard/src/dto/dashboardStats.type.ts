import { ObjectType, Field, Int, Float, GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType({ description: 'Top-scoring job match' })
export class TopScoringMatch {
	@Field(() => String, { nullable: true, description: 'Job post title' })
	jobTitle?: string;

	@Field(() => Float, { description: 'Match score (0-100)' })
	matchScore: number;

	@Field(() => String, { nullable: true, description: 'Provider code (e.g. upwork)' })
	providerCode?: string;
}

@ObjectType({ description: 'Score distribution bucket' })
export class ScoreDistributionBucket {
	@Field(() => String, { description: 'Score range label (e.g. "90-100")' })
	range: string;

	@Field(() => Int, { description: 'Number of matches in this range' })
	count: number;
}

@ObjectType({ description: 'Recent activity entry' })
export class RecentActivityEntry {
	@Field(() => String, { description: 'Activity type (match | application)' })
	type: string;

	@Field(() => String, { description: 'Human-readable description' })
	description: string;

	@Field(() => GraphQLISODateTime, { description: 'When the activity occurred' })
	timestamp: Date;
}

@ObjectType({ description: 'Dashboard statistics' })
export class DashboardStats {
	@Field(() => Int, { description: 'Total number of job matches' })
	totalMatches: number;

	@Field(() => Int, { description: 'Total applications sent' })
	totalApplications: number;

	@Field(() => Float, { nullable: true, description: 'Average match score across all matches' })
	avgMatchScore?: number;

	@Field(() => Int, { description: 'Number of new matches today' })
	matchesToday: number;

	@Field(() => Int, { description: 'Applications sent today' })
	applicationsSentToday: number;

	@Field(() => TopScoringMatch, { nullable: true, description: 'Highest-scoring match' })
	topScoringMatch?: TopScoringMatch;

	@Field(() => [ScoreDistributionBucket], { description: 'Score distribution in buckets' })
	scoreDistribution: ScoreDistributionBucket[];

	@Field(() => [RecentActivityEntry], { description: 'Recent activity feed' })
	recentActivity: RecentActivityEntry[];
}
