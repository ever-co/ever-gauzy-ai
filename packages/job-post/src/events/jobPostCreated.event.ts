import { JobPost } from "@packages/entities";

export class JobPostCreatedEvent {
    constructor(public readonly jobPosts: JobPost[]) {}
}