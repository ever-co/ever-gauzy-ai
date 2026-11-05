import { AutomationTask } from "@packages/entities";

export class AutomationTaskCreatedEvent {
    constructor(public automationTask: AutomationTask) {}
}
