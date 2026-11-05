import type { EmployeeJobApplication } from '@packages/entities';
import { unansweredScreeningQuestions } from './screeningAnswers';

/** The all-zero UUID callers send for "not known" (see the `/process` endpoint). */
const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

const isKnown = (value: string | null | undefined): boolean => !!value && value.trim() !== '' && value !== UNKNOWN_ID;

/** An application as returned by the create command: with why it was not sent, if it was not. */
export type SubmittedEmployeeJobApplication = EmployeeJobApplication & {
	/** Empty when the `apply_job` automation task was queued; otherwise why the application stays a draft. */
	automationTaskBlockers: string[];
};

/**
 * What keeps an application from being sent to the employee's client as an `apply_job`
 * automation task; empty when it can be sent. The client presents the task to the person, who
 * submits it on the job platform, so it needs the proposal text, an answer for every screening
 * question, and the platform and job to open. An application with blockers stays a draft (no task);
 * completing it (an edit, `generate-proposal`) sends nothing by itself: the next submission
 * (`/process`, `applyToJob`) of the complete application queues the task.
 */
export function automationTaskBlockers(
	application: Pick<EmployeeJobApplication, 'proposal' | 'qa' | 'providerCode' | 'providerJobId'>
): string[] {
	const blockers: string[] = [];
	if (!application.proposal?.trim()) {
		blockers.push('no proposal: write one or generate it (generate-proposal), then submit again');
	}
	const unanswered = unansweredScreeningQuestions(application.qa);
	if (unanswered > 0) {
		blockers.push(`${unanswered} screening question(s) without an answer`);
	}
	if (!isKnown(application.providerCode)) {
		blockers.push('no providerCode: the job platform is not known');
	}
	if (!isKnown(application.providerJobId)) {
		blockers.push('no providerJobId: the job cannot be opened on the platform');
	}
	return blockers;
}

/** Whether a provider id is a real one (not empty and not the all-zero "unknown" UUID). */
export const isKnownProviderId = isKnown;
