import { Injectable, Logger } from '@nestjs/common';
import { JobPost } from '@packages/entities';
import { EverJobsJobPost } from '@packages/ever-jobs-client';

/** `providerCode` of the Ever Jobs provider, stored as `JobPost.ingestedBy` on every post it maps. */
export const EVER_JOBS_PROVIDER_CODE = 'ever-jobs';

/**
 * Maps Ever Jobs API DTOs to gauzy-ai JobPost entities.
 *
 * This is a pure mapping service with no side effects, making it
 * easy to test in isolation.
 */
@Injectable()
export class EverJobsMapperService {
	private readonly logger = new Logger(EverJobsMapperService.name);

	/**
	 * Map an array of Ever Jobs API job posts to gauzy-ai JobPost entities.
	 *
	 * @param jobs - Array of jobs from the Ever Jobs API
	 * @param searchKeyword - Optional: the search term used to find these jobs
	 * @returns Array of JobPost entities ready for persistence
	 */
	mapMany(jobs: EverJobsJobPost[], searchKeyword?: string): JobPost[] {
		return jobs
			.map((job) => this.mapOne(job, searchKeyword))
			.filter((job): job is JobPost => job !== null);
	}

	/**
	 * Map a single Ever Jobs API job post to a gauzy-ai JobPost entity.
	 *
	 * @param dto - A single job from the Ever Jobs API
	 * @param searchKeyword - Optional: the search term used
	 * @returns A JobPost entity, or null if the job is invalid
	 */
	mapOne(dto: EverJobsJobPost, searchKeyword?: string): JobPost | null {
		if (!dto || !dto.title) {
			this.logger.warn('Skipping job with missing title');
			return null;
		}

		const entity = new JobPost();

		// ── Core identifiers ───────────────────────────────────────
		entity.providerCode = dto.site ?? EVER_JOBS_PROVIDER_CODE;
		entity.providerJobId = this.buildProviderJobId(dto);
		// the site code above does not say the post came through Ever Jobs (a site may also have a
		// provider of its own, e.g. `upwork`); this does, and picks the liveness verifier
		entity.ingestedBy = EVER_JOBS_PROVIDER_CODE;
		entity.title = dto.title;
		entity.description = dto.description ?? '';

		// ── Dates ──────────────────────────────────────────────────
		if (dto.datePosted) {
			const parsed = new Date(dto.datePosted);
			if (!isNaN(parsed.getTime())) {
				entity.jobDateCreated = parsed;
			} else {
				this.logger.warn(`Invalid date skipped: "${dto.datePosted}"`);
			}
		}

		// ── URL ────────────────────────────────────────────────────
		entity.url = dto.jobUrl || dto.jobUrlDirect || undefined;

		// ── Job type ───────────────────────────────────────────────
		if (dto.jobType?.length) {
			entity.jobType = this.mapJobType(dto.jobType[0]);
		}

		// ── Compensation → budget string ───────────────────────────
		if (dto.compensation) {
			entity.budget = this.formatBudget(dto.compensation);
			entity.compensationMin = dto.compensation.minAmount ?? undefined;
			entity.compensationMax = dto.compensation.maxAmount ?? undefined;
			entity.compensationCurrency = dto.compensation.currency ?? undefined;
			entity.compensationInterval = dto.compensation.interval ?? undefined;
		}

		// ── Location ───────────────────────────────────────────────
		if (dto.location) {
			entity.country = this.formatCountry(dto.location);
			entity.location = this.formatLocation(dto.location);
		}

		// ── Company info ───────────────────────────────────────────
		entity.companyName = dto.companyName ?? undefined;
		entity.companyUrl = dto.companyUrl ?? dto.companyUrlDirect ?? undefined;

		// ── Remote ─────────────────────────────────────────────────
		entity.isRemote = dto.isRemote ?? undefined;

		// ── Skills ─────────────────────────────────────────────────
		if (dto.skills?.length) {
			entity.skills = dto.skills.join(', ');
		}

		// ── Source URL ──────────────────────────────────────────────
		entity.sourceUrl = dto.applyUrl ?? dto.jobUrlDirect ?? undefined;

		// ── Company enrichment ─────────────────────────────────────
		entity.companyIndustry = dto.companyIndustry ?? undefined;
		entity.companyLogo = dto.companyLogo ?? undefined;
		entity.companyDescription = dto.companyDescription ?? undefined;
		entity.companyNumEmployees = dto.companyNumEmployees ?? undefined;
		entity.companyRating = dto.companyRating ?? undefined;

		// ── Job metadata ──────────────────────────────────────────
		entity.jobLevel = dto.jobLevel ?? undefined;
		entity.jobFunction = dto.jobFunction ?? undefined;
		entity.listingType = dto.listingType ?? undefined;
		entity.experienceRange = dto.experienceRange ?? undefined;
		entity.bannerPhotoUrl = dto.bannerPhotoUrl ?? undefined;

		// ── ATS metadata ──────────────────────────────────────────
		entity.department = dto.department ?? undefined;
		entity.team = dto.team ?? undefined;
		entity.atsType = dto.atsType ?? undefined;
		entity.atsId = dto.atsId ?? undefined;
		entity.employmentType = dto.employmentType ?? undefined;

		// ── Search metadata ────────────────────────────────────────
		entity.searchCategory = dto.site ?? undefined;
		entity.searchKeyword = searchKeyword ?? undefined;

		return entity;
	}

	private buildProviderJobId(dto: EverJobsJobPost): string {
		const site = dto.site ?? 'unknown';
		if (dto.id) {
			return `${site}-${dto.id}`;
		}
		return `${site}-${this.simpleHash(dto.jobUrl)}`;
	}

	private mapJobType(type: string): string {
		const map: Record<string, string> = {
			fulltime: 'Full Time',
			parttime: 'Part Time',
			contract: 'Contract',
			temporary: 'Temporary',
			internship: 'Internship',
			perdiem: 'Per Diem',
			nights: 'Nights',
			other: 'Other',
			summer: 'Summer',
			volunteer: 'Volunteer',
		};
		return map[type?.toLowerCase()] ?? type ?? 'Other';
	}

	private formatBudget(comp: { minAmount?: number | null; maxAmount?: number | null; interval?: string | null; currency?: string }): string {
		const min = comp.minAmount;
		const max = comp.maxAmount;

		if (min == null && max == null) return '';

		const suffix = comp.interval && comp.interval !== 'yearly' && comp.interval !== 'fixed'
			? `/${comp.interval.substring(0, 2)}`
			: '';

		if (min != null && max != null && min !== max) {
			return `${min}-${max}${suffix}`;
		}
		return `${min ?? max}${suffix}`;
	}

	private formatLocation(loc: { city?: string | null; state?: string | null; country?: string | null }): string {
		return [loc.city, loc.state, loc.country]
			.filter(Boolean)
			.join(', ');
	}

	private formatCountry(loc: { country?: string | null }): string | undefined {
		return loc.country ?? undefined;
	}

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}
}
