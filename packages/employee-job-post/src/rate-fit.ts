import type { JobPost } from '@packages/entities';

/** The job fields the rate rule reads. */
export type RateSource = Pick<JobPost, 'jobType' | 'compensationInterval' | 'compensationMax' | 'compensationMin' | 'compensationCurrency' | 'budget'>;

/** An hourly upper bound with the currency it is expressed in (undefined currency = not stated). */
export interface HourlyBound {
	amount: number;
	currency?: string;
}

const CURRENCY_MARKERS: Array<[RegExp, string]> = [
	[/€|\bEUR\b/i, 'EUR'],
	[/£|\bGBP\b/i, 'GBP'],
	[/₹|\bINR\b/i, 'INR'],
	[/\bCAD\b|C\$/i, 'CAD'],
	[/\bAUD\b|A\$/i, 'AUD'],
	[/\$|\bUSD\b/i, 'USD'],
];
/** Any other ISO code written next to an amount ("CHF 20", "50 SGD"): stated, so not comparable with a USD minimum. */
const CODE_NEXT_TO_AMOUNT = /\b([A-Z]{3})\s*\d|\d\s*([A-Z]{3})\b/;

const NUMBER = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const CUR = String.raw`(?:[$€£₹]|[A-Z]{3}\s*)?`;
const HOURLY_MARKER = String.raw`(?:\s*[A-Z]{3})?\s*(?:/\s*h(?:ou)?r\b|/h\b|per\s+hour|hourly|an\s+hour)`;
/** "$20-$50/hr", "20 - 50 USD per hour", "$20/hr - $50/hr": a range that is the advertised hourly rate (marker after it, optionally after both ends). */
const RANGE_HOURLY = new RegExp(`${CUR}${NUMBER}(?:${HOURLY_MARKER})?\\s*(?:-|–|to)\\s*${CUR}${NUMBER}${HOURLY_MARKER}`, 'i');
/** "20-50" as the entire budget: the range itself is the advertised amount. */
const BARE_RANGE = new RegExp(`^\\s*${CUR}${NUMBER}\\s*(?:-|–|to)\\s*${CUR}${NUMBER}\\s*$`, 'i');
/** "1000-": a lower bound only (the contract of `budget`), the upper bound is unknown. */
const LOWER_ONLY = new RegExp(`^\\s*${CUR}${NUMBER}\\s*-\\s*$`, 'i');
/** "-200": an upper bound only. */
const UPPER_ONLY = new RegExp(`^\\s*-\\s*${CUR}${NUMBER}\\s*$`, 'i');
/** "$75/hr", "75 per hour", "75 hourly": a single hourly rate. */
const SINGLE_HOURLY = new RegExp(`${CUR}${NUMBER}${HOURLY_MARKER}`, 'i');
/** A bare number is the budget's own contract ("1000" = equal to 1000). */
const BARE = new RegExp(`^\\s*${CUR}${NUMBER}\\s*$`, 'i');

const parseAmount = (text: string): number => Number(text.replace(/,/g, ''));

const currencyOf = (text: string): string | undefined => {
	const known = CURRENCY_MARKERS.find(([marker]) => marker.test(text))?.[1];
	if (known) return known;
	const code = text.match(CODE_NEXT_TO_AMOUNT);
	return code ? (code[1] ?? code[2]).toUpperCase() : undefined;
};

/**
 * Largest hourly amount a job post advertises: the structured compensation fields when present,
 * otherwise the rate or range the budget text advertises (a range is taken only when it is the
 * hourly rate itself or the whole budget, so "30-40 hours/week" never counts). A stated minimum
 * without a maximum, a lower-only range ("20-") and other numbers give no upper bound.
 */
export function hourlyRateUpperBound(job: RateSource): HourlyBound | undefined {
	const max = toNumber(job.compensationMax);
	if (max !== undefined) {
		return { amount: max, currency: job.compensationCurrency?.toUpperCase() || undefined };
	}
	if (toNumber(job.compensationMin) !== undefined) {
		return undefined; // a stated minimum is not a ceiling: the upper bound is unknown
	}
	const text = job.budget ?? '';
	if (!text.trim()) return undefined;
	const currency = currencyOf(text);
	if (LOWER_ONLY.test(text)) return undefined;
	const upperOnly = text.match(UPPER_ONLY);
	if (upperOnly) return { amount: parseAmount(upperOnly[1]), currency };
	// the advertised rate first; a range elsewhere in the text ("30-40 hours/week") is not a rate
	const range = text.match(RANGE_HOURLY);
	if (range) return { amount: parseAmount(range[2]), currency };
	const single = text.match(SINGLE_HOURLY);
	if (single) return { amount: parseAmount(single[1]), currency };
	const bareRange = text.match(BARE_RANGE);
	if (bareRange) return { amount: parseAmount(bareRange[2]), currency };
	const bare = text.match(BARE);
	if (bare) return { amount: parseAmount(bare[1]), currency };
	return undefined;
}

/** True when the job is paid by the hour (fixed-price jobs are not subject to the rate rule). */
export function isHourlyJob(job: Pick<JobPost, 'jobType' | 'compensationInterval' | 'budget'>): boolean {
	const type = (job.jobType ?? '').toLowerCase();
	const interval = (job.compensationInterval ?? '').toLowerCase();
	if (type.includes('hour') || interval.includes('hour')) return true;
	if (type.includes('fixed') || interval.includes('fixed') || interval === 'yearly' || interval === 'monthly') return false;
	return SINGLE_HOURLY.test(job.budget ?? '') || /\/\s*h(ou)?r\b|per hour|hourly/i.test(job.budget ?? '');
}

/**
 * The minimum-rate rule (issue #52): an hourly job matches an employee only when the job's upper
 * hourly bound is at least the employee's minimum rate. "$20-$50/hr" → bound 50: matches a
 * minimum of 25 or 50, not 70. The minimum is in USD (`Employee.preferredRate`); a bound in
 * another currency cannot be compared and does not exclude. No minimum rate, a fixed-price job
 * or a job without a recognizable rate → the rule does not exclude the job (AI scoring still
 * weighs the budget).
 */
export function hourlyRateFits(job: RateSource, minimumHourlyRateUsd: number | string | null | undefined): boolean {
	const minimum = toNumber(minimumHourlyRateUsd);
	if (minimum === undefined || minimum <= 0) return true;
	if (!isHourlyJob(job)) return true;
	const bound = hourlyRateUpperBound(job);
	if (bound === undefined) return true;
	if (bound.currency && bound.currency !== 'USD') return true;
	return bound.amount >= minimum;
}

const toNumber = (value: unknown): number | undefined => {
	if (value === undefined || value === null || value === '') return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
};
