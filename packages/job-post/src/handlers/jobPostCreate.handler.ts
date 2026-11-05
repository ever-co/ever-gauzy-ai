import { ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { JobPostCreateCommand } from '../commands/jobPostCreate.command';
import { JobPost } from '@packages/entities';
import { JobPostService } from '../jobPost.service';
import { JobPostCreatedEvent } from '../events/jobPostCreated.event';
import { JobPostUpdatedEvent } from '../events/jobPostUpdated.event';

@CommandHandler(JobPostCreateCommand)
export class JobPostCreateCommandHandler
	implements ICommandHandler<JobPostCreateCommand> {
	constructor(
		private readonly jobPostService: JobPostService,
		private readonly eventBus: EventBus,
	) { }

	async execute(command: JobPostCreateCommand): Promise<void> {
		const { jobPosts } = command;

		// new jobs will be stored in this var
		const newJobs = new Array<JobPost>();

		// existed jobs in our DB will be stored in this var
		const existedJobsToUpdate = new Array<JobPost>();

		await Promise.all(
			jobPosts.map(async (job: JobPost) => {
				const existedJobsInDB = await this.jobPostService.find({
					where: {
						providerCode: job.providerCode,
						providerJobId: job.providerJobId
					}
				});

				console.log(`Found ${existedJobsInDB.length} jobs in DB with UpworkId = ${job.providerJobId}`);

				// No jobs with such Upwork ID in our DB for now and jobStatus is 'open', let's add it
				if (existedJobsInDB.length == 0) {
					newJobs.push(job);
				} else {
					job.id = existedJobsInDB[0].id;
					existedJobsToUpdate.push(job);
				}
			}),
		);

		// let's save jobs to DB
		console.log(`Saving ${newJobs.length} new job posts into DB...`);
		await this.jobPostService.saveMany(newJobs);
		console.log(`Added ${newJobs.length} job posts into DB`);

		console.log(`Updating ${existedJobsToUpdate.length} job posts in DB...`);
		await this.jobPostService.updateMany(existedJobsToUpdate);
		console.log(`Updated ${existedJobsToUpdate.length} job posts into DB`);

		// new posts are matched against every employee
		this.eventBus.publish(new JobPostCreatedEvent(newJobs));

		// posts we already had (found again, or re-offered by the `source-db` provider) are re-matched
		// against the employees whose criteria or profile changed since (EmployeeJobPostService.rematch())
		if (existedJobsToUpdate.length > 0) {
			this.eventBus.publish(new JobPostUpdatedEvent(existedJobsToUpdate));
		}
	}
}
