import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationTask } from '@packages/entities';
import { NovuService } from '@packages/novu';
import { employeeRecipient } from '@packages/novu/novu.recipient';
import { AutomationTaskFinishedEvent } from '../events/automationTaskFinished.event';
import { parseJsonObject } from '../automationTask.status';

/**
 * Notifies the employee a task belongs to that it finished (`automation-task-complete`), once per
 * `AutomationTaskFinishedEvent`. Nothing is loaded or sent when Novu is not configured or the
 * `novu` plugin is switched off. A task without an employee (a broadcast task) is not notified,
 * and neither is an employee of another tenant than the task's: the CRUD pins a task to the
 * caller's tenant but not its `employeeId`.
 */
@EventsHandler(AutomationTaskFinishedEvent)
export class AutomationTaskFinishedEventHandler implements IEventHandler<AutomationTaskFinishedEvent> {
	private readonly logger = new Logger(AutomationTaskFinishedEventHandler.name);

	constructor(
		@InjectRepository(AutomationTask)
		private readonly tasks: Repository<AutomationTask>,
		private readonly novuService: NovuService
	) {}

	async handle(event: AutomationTaskFinishedEvent): Promise<void> {
		if (!this.novuService.isEnabled()) {
			this.logger.debug(`Novu not configured or disabled: task ${event.taskId} finished (${event.status}) without notification`);
			return;
		}
		try {
			const task = await this.tasks.findOne({ where: { id: event.taskId }, relations: { employee: true } });
			if (!task?.employee) {
				this.logger.debug(`Task ${event.taskId} has no employee: no notification`);
				return;
			}
			if ((task.employee.tenantId ?? null) !== (task.tenantId ?? null)) {
				this.logger.warn(`Task ${event.taskId} refers to an employee of another tenant: no notification`);
				return;
			}
			await this.novuService.sendAutomationTaskComplete(employeeRecipient(task.employee.id, task.employee), {
				taskId: task.id,
				commandType: task.commandType ?? 'unknown',
				status: event.status,
				employeeId: task.employee.id,
				...jobTitleOf(task.command),
				...(event.status === 'failed' && event.errorMessage ? { errorMessage: event.errorMessage } : {}),
			});
		} catch (error) {
			this.logger.warn(
				`Failed to notify the outcome of task ${event.taskId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}

/** `jobTitle` of an `apply_job` command. Only that field is read: a login command carries credentials. */
const jobTitleOf = (command: string | null | undefined): { jobTitle?: string } => {
	const jobTitle = parseJsonObject(command)?.jobTitle;
	return typeof jobTitle === 'string' && jobTitle ? { jobTitle } : {};
};
