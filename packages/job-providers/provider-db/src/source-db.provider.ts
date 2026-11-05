import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, ILike } from 'typeorm';
import { IJobProvider } from '@packages/core-providers';
import { JobPost } from '@packages/entities';

/**
 * Configuration for the Source-DB provider.
 */
export interface SourceDbProviderConfig {
	/** Whether this provider is enabled (default: false) */
	enabled: boolean;

	/** Maximum age of jobs to consider, in hours (default: 72) */
	maxAgeHours: number;
}

/**
 * IJobProvider implementation that queries the **local database** as a source.
 *
 * This enables the "network effect" described in PRD §1.6: jobs found by one
 * employee's criteria can match other employees via AI scoring, without
 * re-fetching from external sources.
 *
 * Only returns active, non-expired jobs that are within the configured max age.
 */
/** Injection token of the provider's settings (defined here so the module ↔ provider imports form no cycle). */
export const SOURCE_DB_CONFIG = 'SOURCE_DB_CONFIG';

@Injectable()
export class SourceDbProvider implements IJobProvider {
	readonly providerCode = 'source-db';
	readonly providerName = 'Local Database Cache';

	private readonly logger = new Logger(SourceDbProvider.name);

	constructor(
		@InjectRepository(JobPost)
		private readonly jobPostRepo: Repository<JobPost>,
		@Inject(SOURCE_DB_CONFIG)
		private readonly config: SourceDbProviderConfig,
	) {
		this.logger.log(
			`SourceDbProvider initialized — enabled: ${config.enabled}, maxAgeHours: ${config.maxAgeHours}`,
		);
	}

	async isEnabled(): Promise<boolean> {
		return this.config.enabled;
	}

	async getJobs(): Promise<JobPost[]> {
		const cutoffDate = new Date();
		cutoffDate.setHours(cutoffDate.getHours() - this.config.maxAgeHours);

		this.logger.log(
			`Searching local DB for active, non-expired jobs newer than ${cutoffDate.toISOString()}`,
		);

		try {
			const queryBuilder = this.jobPostRepo
				.createQueryBuilder('jp')
				.where('jp.isActive = :isActive', { isActive: true })
				.andWhere('jp.createdAt > :cutoffDate', { cutoffDate })
				.andWhere('(jp.isExpired IS NULL OR jp.isExpired = :notExpired)', {
					notExpired: false,
				});

			queryBuilder
				.orderBy('jp.createdAt', 'DESC')
				.limit(200); // Cap to prevent overloading the matching pipeline

			const jobs = await queryBuilder.getMany();

			this.logger.log(`Found ${jobs.length} job(s) in local DB cache`);
			return jobs;
		} catch (error) {
			this.logger.error(
				`Error querying local DB for jobs: ${error instanceof Error ? error.message : error}`,
			);
			return [];
		}
	}
}
