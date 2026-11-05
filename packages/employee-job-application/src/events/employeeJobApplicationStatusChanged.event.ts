import type { NotifiedApplicationStatus } from '../applicationStatus';

/**
 * The `appliedStatus` of an application changed to a value that stands for a different
 * `application-status` notification status (see `applicationStatusChange()`). Published once per
 * change, after it is stored: by `EmployeeJobApplicationService.finalize()` and, for every other
 * entity save (REST and GraphQL CRUD), by `EmployeeJobApplicationSubscriber`.
 */
export class EmployeeJobApplicationStatusChangedEvent {
	constructor(
		public readonly applicationId: string,
		public readonly status: NotifiedApplicationStatus,
		/** The stored `appliedStatus` before the change. */
		public readonly previousAppliedStatus?: string | null
	) {}
}
