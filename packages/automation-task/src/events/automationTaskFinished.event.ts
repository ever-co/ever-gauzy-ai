import type { AutomationTaskOutcome } from '../automationTask.status';

/**
 * A task reached a terminal status (`completed`, `failed`, `timeout`). Published once per
 * transition and only after the change is committed: by `AutomationTaskSubscriber` for every
 * entity save (REST, GraphQL, CQRS) and by `OpsService.cleanupStaleTasks()` for the tasks it
 * times out.
 */
export class AutomationTaskFinishedEvent {
	constructor(
		public readonly taskId: string,
		public readonly status: AutomationTaskOutcome,
		/** The status before the transition; undefined when the task was created already finished. */
		public readonly previousStatus?: string,
		/** For `failed`: the error reported in `commandResult` by the write that made the transition. */
		public readonly errorMessage?: string
	) {}
}
