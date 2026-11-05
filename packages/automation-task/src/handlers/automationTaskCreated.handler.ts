import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { AutomationTaskCreatedEvent } from '../events/automationTaskCreated.event';

/**
 * Handles the AutomationTaskCreated event (a task queued through `AutomationTaskCreateCommand`).
 *
 * Nothing is notified here: the `automation-task-complete` notification reports an outcome and is
 * sent by `AutomationTaskFinishedEventHandler` when a task reaches a terminal status. A task
 * created already finished is covered too: `AutomationTaskSubscriber` sees the insert.
 */
@EventsHandler(AutomationTaskCreatedEvent)
export class AutomationTaskCreatedEventHandler
	implements IEventHandler<AutomationTaskCreatedEvent> {
	private readonly logger = new Logger(AutomationTaskCreatedEventHandler.name);

	handle(event: AutomationTaskCreatedEvent): void {
		const { automationTask } = event;
		this.logger.debug(
			`Automation task ${automationTask.id} (${automationTask.commandType}) created with status "${automationTask.status ?? 'open'}"`,
		);
	}
}
