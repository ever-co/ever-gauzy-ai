import { EmployeeJobApplication } from "@packages/entities";

export class EmployeeJobApplicationCreatedEvent {
    constructor(public readonly employeeJobApplication: EmployeeJobApplication) {}
}
