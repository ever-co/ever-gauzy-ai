import type { ApplicationStatusPayload } from '@packages/novu/novu.workflows';

/** A status of the `application-status` notification. */
export type NotifiedApplicationStatus = ApplicationStatusPayload['status'];

/**
 * `appliedStatus` is free text written by the client (`finalize`, the CRUD). These values (compared
 * case-insensitively) stand for a status of the `application-status` notification; any other value
 * (`failed`, an empty string, ...) is stored but not notified.
 */
const NOTIFIED_STATUS_BY_APPLIED_STATUS: ReadonlyMap<string, NotifiedApplicationStatus> = new Map<string, NotifiedApplicationStatus>([
	['applied', 'applied'],
	['submitted', 'applied'],
	['succeed', 'applied'],
	['succeeded', 'applied'],
	['success', 'applied'],
	['viewed', 'viewed'],
	['shortlisted', 'shortlisted'],
	['rejected', 'rejected'],
	['declined', 'rejected'],
	['won', 'won'],
	['hired', 'won'],
	['withdrawn', 'withdrawn'],
]);

/** The notification status `appliedStatus` stands for, or undefined when it is not one that is notified. */
export const notifiedApplicationStatus = (appliedStatus: string | null | undefined): NotifiedApplicationStatus | undefined =>
	appliedStatus ? NOTIFIED_STATUS_BY_APPLIED_STATUS.get(appliedStatus.trim().toLowerCase()) : undefined;

/**
 * The status to notify when `appliedStatus` changes from `previous` to `next`, or undefined when the
 * change is not a real one for the person: `next` is not a notified value, or it stands for the same
 * status as `previous` (`succeed` after `applied`).
 */
export const applicationStatusChange = (
	previous: string | null | undefined,
	next: string | null | undefined
): NotifiedApplicationStatus | undefined => {
	const status = notifiedApplicationStatus(next);
	return status && status !== notifiedApplicationStatus(previous) ? status : undefined;
};
