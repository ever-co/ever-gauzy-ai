import { hourlyRateFits, hourlyRateUpperBound, isHourlyJob } from './rate-fit';

describe('minimum hourly rate rule (issue #52)', () => {
	const hourly = (budget: string, extra: Record<string, unknown> = {}) => ({ jobType: 'hourly', budget, ...extra }) as any;

	it('takes the upper bound of the advertised hourly range, from the fields or the budget text', () => {
		expect(hourlyRateUpperBound(hourly('$20-$50/hr'))).toEqual({ amount: 50, currency: 'USD' });
		expect(hourlyRateUpperBound(hourly('20 - 50 USD per hour'))).toEqual({ amount: 50, currency: 'USD' });
		expect(hourlyRateUpperBound(hourly('$20/hr - $50/hr'))).toEqual({ amount: 50, currency: 'USD' }); // marker after both ends
		expect(hourlyRateUpperBound(hourly('CHF 20-50/hr'))).toEqual({ amount: 50, currency: 'CHF' }); // any stated code is kept
		expect(hourlyRateUpperBound(hourly('20-50 SGD per hour'))).toEqual({ amount: 50, currency: 'SGD' });
		expect(hourlyRateUpperBound(hourly('PHP developer, $20-$50/hr'))).toEqual({ amount: 50, currency: 'USD' }); // a code away from the amount is not a currency
		expect(hourlyRateUpperBound(hourly('$1,200/hr'))).toEqual({ amount: 1200, currency: 'USD' });
		expect(hourlyRateUpperBound(hourly('75 per hour'))).toEqual({ amount: 75, currency: undefined });
		expect(hourlyRateUpperBound(hourly('', { compensationMin: 10, compensationMax: 25, compensationCurrency: 'usd' }))).toEqual({ amount: 25, currency: 'USD' });
		expect(hourlyRateUpperBound(hourly('', { compensationMin: '30' }))).toBeUndefined(); // a minimum is not a ceiling
		expect(hourlyRateUpperBound(hourly('20-50'))).toEqual({ amount: 50, currency: undefined }); // the whole budget is the range
		expect(hourlyRateUpperBound(hourly('-200'))).toEqual({ amount: 200, currency: undefined }); // upper bound only
		expect(hourlyRateUpperBound(hourly('1000'))).toEqual({ amount: 1000, currency: undefined }); // equal-to budget
	});

	it('ignores numbers that are not an advertised rate and lower-only ranges', () => {
		expect(hourlyRateUpperBound(hourly('$20-$50/hr (160 hours/month)'))).toEqual({ amount: 50, currency: 'USD' });
		expect(hourlyRateUpperBound(hourly('160 hours/month'))).toBeUndefined();
		expect(hourlyRateUpperBound(hourly('$20/hr (30-40 hours/week)'))).toEqual({ amount: 20, currency: 'USD' }); // the workload range is not the rate
		expect(hourlyRateUpperBound(hourly('20-'))).toBeUndefined(); // lower bound only: upper unknown
		expect(hourlyRateUpperBound(hourly('negotiable'))).toBeUndefined();
		expect(hourlyRateUpperBound(hourly(''))).toBeUndefined();
	});

	it('recognises hourly jobs from the type, the interval or the budget text', () => {
		expect(isHourlyJob({ jobType: 'Hourly' } as any)).toBe(true);
		expect(isHourlyJob({ compensationInterval: 'hourly' } as any)).toBe(true);
		expect(isHourlyJob({ budget: '$40/hr' } as any)).toBe(true);
		expect(isHourlyJob({ jobType: 'fixed', budget: '$500' } as any)).toBe(false);
		expect(isHourlyJob({ compensationInterval: 'yearly', budget: '120000' } as any)).toBe(false);
	});

	it('applies the examples of the issue', () => {
		expect(hourlyRateFits(hourly('$20-$50/hr'), 70)).toBe(false); // 50 is not >= 70
		expect(hourlyRateFits(hourly('$20-$50/hr'), 25)).toBe(true);
		expect(hourlyRateFits(hourly('$20/hr - $50/hr'), 25)).toBe(true); // the ceiling is 50, not the first number
		expect(hourlyRateFits(hourly('$10-$25/hr'), 20)).toBe(true);
		expect(hourlyRateFits(hourly('$10-$20/hr'), 20)).toBe(true); // equal matches
		expect(hourlyRateFits(hourly('', { compensationMax: 45 }), '50.00')).toBe(false); // decimal column comes back as a string
		expect(hourlyRateFits(hourly('$20-$50/hr (160 hours/month)'), 70)).toBe(false); // the hours are not a rate
		expect(hourlyRateFits(hourly('$20/hr (30-40 hours/week)'), 30)).toBe(false); // 20 < 30, the 30-40 is workload
		expect(hourlyRateFits(hourly('', { compensationMin: 30 }), 50)).toBe(true); // minimum only: unknown ceiling
	});

	it('does not exclude when the rule cannot be applied', () => {
		expect(hourlyRateFits(hourly('$20-$50/hr'), undefined)).toBe(true);
		expect(hourlyRateFits(hourly('$20-$50/hr'), null)).toBe(true);
		expect(hourlyRateFits(hourly('$20-$50/hr'), 0)).toBe(true);
		expect(hourlyRateFits({ jobType: 'fixed', budget: '$300' } as any, 70)).toBe(true);
		expect(hourlyRateFits(hourly('negotiable'), 70)).toBe(true);
		expect(hourlyRateFits(hourly('20-'), 70)).toBe(true); // no known upper bound
		expect(hourlyRateFits(hourly('₹1000-₹2000/hr'), 70)).toBe(true); // not USD: not comparable
		expect(hourlyRateFits(hourly('CHF 20-50/hr'), 70)).toBe(true); // an unlisted currency is still not USD
		expect(hourlyRateFits(hourly('20-50 SGD per hour'), 70)).toBe(true);
		// the Upwork mapping of a minimum-only posting: no maximum, budget text without a ceiling
		expect(hourlyRateFits(hourly('from $30/hr', { compensationMin: 30, compensationMax: undefined, compensationCurrency: 'USD' }), 50)).toBe(true);
		expect(hourlyRateFits(hourly('', { compensationMax: 1000, compensationCurrency: 'INR' }), 70)).toBe(true);
	});
});
