import { EmployeeJobApplication } from "@packages/entities";

export class EmployeeJobApplicationCreateCommand {
    constructor(public readonly employeeJobApplication: EmployeeJobApplication) {}
}
