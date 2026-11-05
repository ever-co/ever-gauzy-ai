import { JobPostCreatedEvent } from '../events/jobPostCreated.event';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

// Handles event when new job posts created in DB
@EventsHandler(JobPostCreatedEvent)
export class JobPostCreatedEventHandler
	implements IEventHandler<JobPostCreatedEvent> {

	async handle(event: JobPostCreatedEvent): Promise<void> {
		const { jobPosts } = event;
	}
}
