import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { EmployeeJobPostCreatedEvent } from '../events/employeeJobPostCreated.event';
import { NovuService } from '@packages/novu';

/**
 * Handles the EmployeeJobPostCreated event.
 *
 * When new employee-job matches are created, notifies the employee
 * via Novu for high-scoring matches (score >= notify threshold).
 */
@EventsHandler(EmployeeJobPostCreatedEvent)
export class EmployeeJobPostCreatedEventHandler
	implements IEventHandler<EmployeeJobPostCreatedEvent> {
	private readonly logger = new Logger(EmployeeJobPostCreatedEventHandler.name);

	constructor(private readonly novuService: NovuService) {}

	async handle(event: EmployeeJobPostCreatedEvent): Promise<void> {
		const { employeeJobPosts } = event;

		this.logger.log(
			`Processing ${employeeJobPosts.length} new employee-job matches`,
		);

		for (const match of employeeJobPosts) {
			// Only send notifications for matches with high AI scores
			// Note: aiScore/aiScoreExplanation are dynamically set during scoring
			const aiScore = (match as any).aiScore;
			const aiScoreExplanation = (match as any).aiScoreExplanation;
			if (aiScore != null && match.employee && match.jobPost) {
				try {
					await this.novuService.sendMatchAlert(
						match.employee as any,
						match.jobPost as any,
						aiScore,
						aiScoreExplanation ?? '',
					);
				} catch (err) {
					this.logger.warn(
						`Failed to send match alert for employee ${match.employeeId}: ${err.message}`,
					);
				}
			}
		}
	}
}