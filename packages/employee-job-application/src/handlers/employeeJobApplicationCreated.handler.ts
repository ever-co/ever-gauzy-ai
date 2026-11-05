import { EmployeeJobApplicationCreatedEvent } from '../events/employeeJobApplicationCreated.event';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

// Handles event when new job application created
@EventsHandler(EmployeeJobApplicationCreatedEvent)
export class EmployeeJobApplicationCreatedEventHandler
	implements IEventHandler<EmployeeJobApplicationCreatedEvent> {
	async handle(event: EmployeeJobApplicationCreatedEvent): Promise<void> {
		const { employeeJobApplication } = event;

		console.log(
			`EmployeeJobApplicationCreatedEventHandler called with EmployeeJobApplication record: ${JSON.stringify(
				employeeJobApplication,
			)}`,
		);
	}
}
