/**
 * Local TypeScript interfaces mirroring Ever Jobs API DTOs.
 * These are kept separate from @ever-jobs/models to keep the repos decoupled.
 */

// ─── Enums ───────────────────────────────────────────────────

/**
 * Job source sites supported by Ever Jobs API.
 * Must stay in sync with the Site enum in @ever-jobs/models.
 */
export enum EverJobsSite {
	// ── General job boards ────────────────────────
	LINKEDIN = 'linkedin',
	INDEED = 'indeed',
	ZIP_RECRUITER = 'zip_recruiter',
	GLASSDOOR = 'glassdoor',
	GOOGLE = 'google',
	BAYT = 'bayt',
	NAUKRI = 'naukri',
	BDJOBS = 'bdjobs',
	INTERNSHALA = 'internshala',
	EXA = 'exa',
	UPWORK = 'upwork',
	JOBICY = 'jobicy',
	HIMALAYAS = 'himalayas',
	REMOTEOK = 'remoteok',
	REMOTIVE = 'remotive',
	ARBEITNOW = 'arbeitnow',
	WEWORKREMOTELY = 'weworkremotely',
	USAJOBS = 'usajobs',
	ADZUNA = 'adzuna',
	REED = 'reed',
	JOOBLE = 'jooble',
	CAREERJET = 'careerjet',
	DICE = 'dice',
	SIMPLYHIRED = 'simplyhired',
	WELLFOUND = 'wellfound',
	STEPSTONE = 'stepstone',
	MONSTER = 'monster',
	CAREERBUILDER = 'careerbuilder',

	// ── ATS platforms ────────────────────────────
	ASHBY = 'ashby',
	GREENHOUSE = 'greenhouse',
	LEVER = 'lever',
	WORKABLE = 'workable',
	SMARTRECRUITERS = 'smartrecruiters',
	RIPPLING = 'rippling',
	WORKDAY = 'workday',
	RECRUITEE = 'recruitee',
	TEAMTAILOR = 'teamtailor',
	BAMBOOHR = 'bamboohr',
	PERSONIO = 'personio',
	JAZZHR = 'jazzhr',
	ICIMS = 'icims',
	TALEO = 'taleo',
	SUCCESSFACTORS = 'successfactors',
	JOBVITE = 'jobvite',
	ADP = 'adp',
	UKG = 'ukg',

	// ── Company-specific scrapers ────────────────
	AMAZON = 'amazon',
	APPLE = 'apple',
	MICROSOFT = 'microsoft',
	NVIDIA = 'nvidia',
	TIKTOK = 'tiktok',
	UBER = 'uber',
	CURSOR = 'cursor',
}

export enum EverJobsJobType {
	FULL_TIME = 'fulltime',
	PART_TIME = 'parttime',
	CONTRACT = 'contract',
	TEMPORARY = 'temporary',
	INTERNSHIP = 'internship',
	PER_DIEM = 'perdiem',
	NIGHTS = 'nights',
	OTHER = 'other',
	SUMMER = 'summer',
	VOLUNTEER = 'volunteer',
}

export enum EverJobsDescriptionFormat {
	MARKDOWN = 'markdown',
	HTML = 'html',
	PLAIN = 'plain',
}

// ─── Input DTO ───────────────────────────────────────────────

/**
 * Search input for the Ever Jobs API.
 * Mirrors ScraperInputDto from @ever-jobs/models.
 */
export interface EverJobsSearchInput {
	/** Sites to scrape (default: all) */
	siteType?: EverJobsSite[];

	/** Search term / keywords */
	searchTerm?: string;

	/** Google-specific search term override */
	googleSearchTerm?: string;

	/** Location to search near */
	location?: string;

	/** Distance in miles from location */
	distance?: number;

	/** Only remote jobs */
	isRemote?: boolean;

	/** Filter by job type */
	jobType?: EverJobsJobType;

	/** Only easy-apply jobs */
	easyApply?: boolean;

	/** Number of results wanted */
	resultsWanted?: number;

	/** Offset for pagination */
	offset?: number;

	/** Max age of listings in hours */
	hoursOld?: number;

	/** Country for domain resolution (matches Ever Jobs Country enum values, e.g. "USA", "GERMANY") */
	country?: string;

	/** Description output format */
	descriptionFormat?: EverJobsDescriptionFormat;

	/** Fetch full LinkedIn descriptions (slower but more complete) */
	linkedinFetchDescription?: boolean;

	/** LinkedIn company IDs to filter by */
	linkedinCompanyIds?: number[];

	/** Request timeout in seconds */
	requestTimeout?: number;

	/** Company slug for ATS board scraping (e.g., "stripe" for Ashby) */
	companySlug?: string;

	/** Maximum concurrent company scrapes for ATS sources */
	maxConcurrentCompanies?: number;

	/** Convert all wages to annual salary equivalent */
	enforceAnnualSalary?: boolean;

	/** Minimum delay between requests in seconds (rate limiting) */
	rateDelayMin?: number;

	/** Maximum delay between requests in seconds (rate limiting) */
	rateDelayMax?: number;

	/** Proxy URLs */
	proxies?: string[];

	/** Custom CA certificate path */
	caCert?: string;

	/** Custom user agent string */
	userAgent?: string;

	/** Client IP address for sources that require it */
	clientIp?: string;

	/** Per-request authentication credentials for individual sources */
	auth?: EverJobsSourceAuth;
}

// ─── Source Auth ──────────────────────────────────────────────

/**
 * Per-source authentication credentials.
 * Mirrors ScraperAuthDto from @ever-jobs/models.
 */
export interface EverJobsSourceAuth {
	upwork?: EverJobsUpworkAuth;
	// Future: linkedin?: EverJobsLinkedInAuth;
}

/**
 * Upwork OAuth2 credentials passed per-request.
 * Mirrors UpworkAuthDto from @ever-jobs/models.
 */
export interface EverJobsUpworkAuth {
	grantType?: string;
	clientId?: string;
	clientSecret?: string;
	accessToken?: string;
	refreshToken?: string;
}

// ─── Response DTOs ───────────────────────────────────────────

export interface EverJobsLocation {
	country?: string | null;
	city?: string | null;
	state?: string | null;
}

export interface EverJobsCompensation {
	interval?: string | null;
	minAmount?: number | null;
	maxAmount?: number | null;
	currency?: string;
}

/**
 * A single job post from the Ever Jobs API.
 * Mirrors JobPostDto from @ever-jobs/models.
 */
export interface EverJobsJobPost {
	id?: string | null;
	title: string;
	companyName?: string | null;
	jobUrl: string;
	jobUrlDirect?: string | null;
	location?: EverJobsLocation | null;
	description?: string | null;
	companyUrl?: string | null;
	companyUrlDirect?: string | null;
	jobType?: EverJobsJobType[] | null;
	compensation?: EverJobsCompensation | null;
	datePosted?: string | null;
	emails?: string[] | null;
	isRemote?: boolean | null;
	listingType?: string | null;
	jobLevel?: string | null;
	companyIndustry?: string | null;
	companyAddresses?: string | null;
	companyNumEmployees?: string | null;
	companyRevenue?: string | null;
	companyDescription?: string | null;
	companyLogo?: string | null;
	bannerPhotoUrl?: string | null;
	jobFunction?: string | null;
	skills?: string[] | null;
	experienceRange?: string | null;
	companyRating?: number | null;
	companyReviewsCount?: number | null;
	vacancyCount?: number | null;
	workFromHomeType?: string | null;
	salarySource?: string | null;
	department?: string | null;
	team?: string | null;
	atsId?: string | null;
	atsType?: string | null;
	employmentType?: string | null;
	applyUrl?: string | null;
	site?: string | null;
}

/**
 * Job analysis result from the Ever Jobs API.
 */
export interface EverJobsAnalysis {
	totalJobs: number;
	[key: string]: any;
}

// ─── Client Config ───────────────────────────────────────────

/**
 * Configuration for the Ever Jobs client module.
 */
export interface EverJobsClientOptions {
	/** Base URL of the Ever Jobs API (e.g., http://localhost:3001) */
	apiUrl: string;

	/** Optional API key for authenticated access */
	apiKey?: string;

	/** Request timeout in milliseconds (default: 420000 = 7 minutes) */
	timeout?: number;
}
