import { Logger } from '@nestjs/common';
import { ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { AutomationTaskCreateCommand } from '../commands/automationTaskCreate.command';
import { AutomationTask } from '@packages/entities';
import { AutomationTaskCreatedEvent } from '../events/automationTaskCreated.event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/** What a log line may say about a task: never `command`, whose payload carries the credentials of a login task. */
const describeTask = (task: AutomationTask): string =>
	JSON.stringify({ id: task.id, commandType: task.commandType, status: task.status, employeeId: task.employeeId });

@CommandHandler(AutomationTaskCreateCommand)
export class AutomationTaskCreateCommandHandler
	implements ICommandHandler<AutomationTaskCreateCommand> {
	private readonly logger = new Logger(AutomationTaskCreateCommandHandler.name);

	constructor(
		@InjectRepository(AutomationTask)
		private readonly repo: Repository<AutomationTask>,

		private readonly eventBus: EventBus,
	) {}

	async execute(command: AutomationTaskCreateCommand): Promise<void> {
		const { automationTask } = command;

		// When EmployeeJobApplication created, we need to call our Automation system to process application on the provider website (e.g. Upwork)
		// For that, we need to create a record in the automationTask table.
		// Note: AI proposal generation (if needed) is handled upstream in the saga before this command is dispatched.

		this.logger.log(`Creating automation task ${describeTask(automationTask)}`);

		// this will save AutomationTask record into DB and later our Automation system will pick it up and process it
		await this.repo.save(automationTask);

		this.logger.log(`Automation task created ${describeTask(automationTask)}`);

		this.eventBus.publish(new AutomationTaskCreatedEvent(automationTask));
	}
}
