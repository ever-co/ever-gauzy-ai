import { JobPost } from "@packages/entities";

export class JobPostCreateCommand {
    constructor(public readonly jobPosts: JobPost[]) {}
}