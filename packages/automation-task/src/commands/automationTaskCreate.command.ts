import { AutomationTask } from "@packages/entities";

export class AutomationTaskCreateCommand {
    constructor(public automationTask: AutomationTask) {}
}
