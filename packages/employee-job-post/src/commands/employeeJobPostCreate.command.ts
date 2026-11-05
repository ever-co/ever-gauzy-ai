import { EmployeeJobPost } from "@packages/entities";

export class EmployeeJobPostCreateCommand {
    constructor(public readonly employeeJobPosts: EmployeeJobPost[]) {}
}
