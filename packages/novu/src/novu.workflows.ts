/**
 * Novu Workflow Definitions
 *
 * Central registry of all Novu workflow identifiers and their typed payloads.
 * Workflow identifiers must match exactly what is configured in the Novu dashboard.
 */

// ─── Workflow Identifiers ───────────────────────────────────────────

/**
 * All Novu workflow identifiers used by Gauzy AI.
 * These must match the workflow identifier in the Novu dashboard exactly.
 */
export const NovuWorkflows = {
	/** Triggered when AI scoring produces a high-confidence job match */
	NEW_JOB_MATCH: 'new-job-match',

	/** Triggered when an application status changes (submitted, viewed, won, etc.) */
	APPLICATION_STATUS: 'application-status',

	/** Triggered when an automation task completes or fails */
	AUTOMATION_TASK_COMPLETE: 'automation-task-complete',

	/** Periodic digest of new matches and application updates */
	DAILY_DIGEST: 'daily-digest',
} as const;

export type NovuWorkflowId = (typeof NovuWorkflows)[keyof typeof NovuWorkflows];

// ─── Subscriber ─────────────────────────────────────────────────────

export interface NovuSubscriber {
	subscriberId: string;
	firstName?: string;
	lastName?: string;
	email?: string;
}

// ─── Payload Interfaces ─────────────────────────────────────────────

/** Payload for the `new-job-match` workflow */
export interface MatchAlertPayload {
	jobTitle: string;
	matchScore: number;
	explanation: string;
	providerCode: string;
	jobPostId: string;
	employeeId: string;
}

/** Payload for the `application-status` workflow */
export interface ApplicationStatusPayload {
	jobTitle: string;
	providerCode: string;
	status: 'applied' | 'viewed' | 'shortlisted' | 'rejected' | 'won' | 'withdrawn';
	applicationId: string;
	employeeId: string;
	/** Optional message from the client/employer */
	clientMessage?: string;
}

/** Payload for the `automation-task-complete` workflow */
export interface AutomationTaskCompletePayload {
	taskId: string;
	commandType: string;
	status: 'completed' | 'failed' | 'timeout';
	employeeId: string;
	/** Job title if the task was related to a job application */
	jobTitle?: string;
	/** Error message if the task failed */
	errorMessage?: string;
}

/** Payload for the `daily-digest` workflow */
export interface DailyDigestPayload {
	employeeId: string;
	/** Number of new matches since last digest */
	newMatchCount: number;
	/** Number of applications submitted since last digest */
	applicationsSubmitted: number;
	/** Number of application status changes since last digest */
	statusChanges: number;
	/** Top matches (limited to 5) */
	topMatches: Array<{
		jobTitle: string;
		matchScore: number;
		providerCode: string;
	}>;
}
