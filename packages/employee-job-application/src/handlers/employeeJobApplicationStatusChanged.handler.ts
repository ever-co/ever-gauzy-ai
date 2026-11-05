import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeJobApplication } from '@packages/entities';
import { NovuService } from '@packages/novu';
import { employeeRecipient } from '@packages/novu/novu.recipient';
import { EmployeeJobApplicationStatusChangedEvent } from '../events/employeeJobApplicationStatusChanged.event';

/**
 * Notifies the employee of an application that its status changed (`application-status`), once
 * per `EmployeeJobApplicationStatusChangedEvent`. Nothing is loaded or sent when Novu is not
 * configured or the `novu` plugin is switched off, and nothing is sent to an employee of another
 * tenant than the application's: the CRUD pins an application to the caller's tenant but not its
 * `employeeId`.
 */
@EventsHandler(EmployeeJobApplicationStatusChangedEvent)
export class EmployeeJobApplicationStatusChangedEventHandler
	implements IEventHandler<EmployeeJobApplicationStatusChangedEvent> {
	private readonly logger = new Logger(EmployeeJobApplicationStatusChangedEventHandler.name);

	constructor(
		@InjectRepository(EmployeeJobApplication)
		private readonly applications: Repository<EmployeeJobApplication>,
		private readonly novuService: NovuService
	) {}

	async handle(event: EmployeeJobApplicationStatusChangedEvent): Promise<void> {
		if (!this.novuService.isEnabled()) {
			this.logger.debug(`Novu not configured or disabled: application ${event.applicationId} is now "${event.status}" without notification`);
			return;
		}
		try {
			const application = await this.applications.findOne({
				where: { id: event.applicationId },
				relations: { employee: true, jobPost: true },
			});
			if (!application?.employee) {
				this.logger.debug(`Application ${event.applicationId} or its employee no longer exists: no notification`);
				return;
			}
			if ((application.employee.tenantId ?? null) !== (application.tenantId ?? null)) {
				this.logger.warn(`Application ${event.applicationId} refers to an employee of another tenant: no notification`);
				return;
			}
			await this.novuService.sendApplicationStatus(employeeRecipient(application.employee.id, application.employee), {
				jobTitle: application.jobPost?.title || 'Unknown Job',
				providerCode: application.providerCode,
				status: event.status,
				applicationId: application.id,
				employeeId: application.employee.id,
			});
		} catch (error) {
			this.logger.warn(
				`Failed to notify the status of application ${event.applicationId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}
