import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, SelectQueryBuilder } from 'typeorm';
import { resolveTenantId } from '@packages/core/context';
import { EmployeeJobPost } from '@packages/entities/employeeJobPost.entity';

@Injectable()
export class DashboardService {
	private readonly logger = new Logger(DashboardService.name);

	constructor(
		@InjectRepository(EmployeeJobPost)
		private readonly ejpRepo: Repository<EmployeeJobPost>,
	) {}

	/**
	 * Compute dashboard statistics, optionally scoped to an employee or tenant.
	 */
	async getStats(employeeId?: string, tenantId?: string): Promise<{
		totalMatches: number;
		totalApplications: number;
		avgMatchScore: number | null;
		matchesToday: number;
		applicationsSentToday: number;
		topScoringMatch: { jobTitle?: string; matchScore: number; providerCode?: string } | null;
		scoreDistribution: { range: string; count: number }[];
		recentActivity: { type: string; description: string; timestamp: Date }[];
	}> {
		tenantId = resolveTenantId(tenantId);
		const where: any = { isActive: true, tenantId };
		if (employeeId) where.employeeId = employeeId;

		// Total matches
		const totalMatches = await this.ejpRepo.count({ where });

		// Total applications
		const totalApplications = await this.ejpRepo.count({
			where: { ...where, isApplied: true },
		});

		// Average match score (parameterized)
		const avgQb = this.ejpRepo
			.createQueryBuilder('ejp')
			.select('AVG(ejp.matchScore)', 'avg');
		this.applyWhereClause(avgQb, employeeId, tenantId);
		avgQb.andWhere('ejp.matchScore IS NOT NULL');
		const avgResult = await avgQb.getRawOne();
		const avgMatchScore = avgResult?.avg ? parseFloat(avgResult.avg) : null;

		// Today's matches and applications
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const matchesToday = await this.ejpRepo.count({
			where: { ...where, createdAt: MoreThanOrEqual(today) },
		});

		const applicationsSentToday = await this.ejpRepo.count({
			where: { ...where, isApplied: true, appliedDate: MoreThanOrEqual(today) },
		});

		// Top-scoring match
		const topMatch = await this.ejpRepo.findOne({
			where: { ...where, matchScore: MoreThanOrEqual(0) },
			order: { matchScore: 'DESC' },
			relations: { jobPost: true },
		});

		const topScoringMatch = topMatch
			? {
				jobTitle: topMatch.jobPost?.title || 'Unknown',
				matchScore: topMatch.matchScore || 0,
				providerCode: topMatch.providerCode || undefined,
			}
			: null;

		// Score distribution (parameterized)
		const scoreDistribution = await this.computeScoreDistribution(employeeId, tenantId);

		// Recent activity (last 10 matches + applications)
		const recentMatches = await this.ejpRepo.find({
			where,
			order: { createdAt: 'DESC' },
			take: 5,
			relations: { jobPost: true },
		});

		const recentApps = await this.ejpRepo.find({
			where: { ...where, isApplied: true },
			order: { appliedDate: 'DESC' },
			take: 5,
			relations: { jobPost: true },
		});

		const recentActivity = [
			...recentMatches.map((m) => ({
				type: 'match',
				description: `Matched "${m.jobPost?.title || 'Unknown'}" (${m.matchScore ?? '?'}%)`,
				timestamp: m.createdAt,
			})),
			...recentApps.map((a) => ({
				type: 'application',
				description: `Applied to "${a.jobPost?.title || 'Unknown'}"`,
				timestamp: a.appliedDate || a.updatedAt,
			})),
		].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);

		return {
			totalMatches,
			totalApplications,
			avgMatchScore,
			matchesToday,
			applicationsSentToday,
			topScoringMatch,
			scoreDistribution,
			recentActivity,
		};
	}

	/**
	 * Apply parameterized where clause to a query builder (safe from SQL injection).
	 */
	private applyWhereClause(
		qb: SelectQueryBuilder<EmployeeJobPost>,
		employeeId?: string,
		tenantId?: string,
	): void {
		qb.where('ejp.isActive = :isActive', { isActive: true });
		if (employeeId) {
			qb.andWhere('ejp.employeeId = :employeeId', { employeeId });
		}
		if (tenantId) {
			qb.andWhere('ejp.tenantId = :tenantId', { tenantId });
		}
	}

	/**
	 * Compute score distribution across 5 buckets (parameterized).
	 */
	private async computeScoreDistribution(
		employeeId?: string,
		tenantId?: string,
	): Promise<{ range: string; count: number }[]> {
		const buckets = [
			{ range: '0-29', min: 0, max: 29 },
			{ range: '30-49', min: 30, max: 49 },
			{ range: '50-69', min: 50, max: 69 },
			{ range: '70-89', min: 70, max: 89 },
			{ range: '90-100', min: 90, max: 100 },
		];

		const result: { range: string; count: number }[] = [];

		for (const bucket of buckets) {
			const qb = this.ejpRepo.createQueryBuilder('ejp');
			this.applyWhereClause(qb, employeeId, tenantId);
			qb.andWhere('ejp.matchScore >= :min AND ejp.matchScore <= :max', {
				min: bucket.min,
				max: bucket.max,
			});

			const count = await qb.getCount();
			result.push({ range: bucket.range, count });
		}

		return result;
	}
}
