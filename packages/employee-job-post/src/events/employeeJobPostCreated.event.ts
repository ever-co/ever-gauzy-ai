import { EmployeeJobPost } from "@packages/entities";

export class EmployeeJobPostCreatedEvent {
    constructor(public readonly employeeJobPosts: EmployeeJobPost[]) {}
}
