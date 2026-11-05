import type { AutomationTaskCompletePayload } from '@packages/novu/novu.workflows';

/** The outcome of a finished task, as reported by the `automation-task-complete` notification. */
export type AutomationTaskOutcome = AutomationTaskCompletePayload['status'];

/** Statuses that end a task: once a task has one, its outcome is notified. */
export const TERMINAL_TASK_STATUSES: ReadonlyArray<AutomationTaskOutcome> = ['completed', 'failed', 'timeout'];

/** Longest error text forwarded to the notification. */
const MAX_ERROR_MESSAGE_LENGTH = 500;

/** The outcome `status` stands for, or undefined while the task is still pending (`open`, `in_progress`, ...). */
export const terminalTaskStatus = (status: string | null | undefined): AutomationTaskOutcome | undefined =>
	TERMINAL_TASK_STATUSES.find((terminal) => terminal === status);

/** Parses a JSON column; anything that is not a JSON object yields undefined. */
export const parseJsonObject = (json: string | null | undefined): Record<string, unknown> | undefined => {
	if (!json) {
		return undefined;
	}
	try {
		const value: unknown = JSON.parse(json);
		return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
};

/** The error a client reported in `commandResult` (`error`, `errorMessage` or `message`), shortened. */
export const failureMessageOf = (commandResult: string | null | undefined): string | undefined => {
	const result = parseJsonObject(commandResult);
	const message = [result?.error, result?.errorMessage, result?.message].find((value) => typeof value === 'string' && value);
	return typeof message === 'string' ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH) : undefined;
};
