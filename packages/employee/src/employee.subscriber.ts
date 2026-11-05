import {
    EntitySubscriberInterface,
    EventSubscriber,
    LoadEvent
} from "typeorm";
import { Employee } from "@packages/entities";

@EventSubscriber()
export class EmployeeSubscriber implements EntitySubscriberInterface<Employee> {

    /**
    * Indicates that this subscriber only listen to Employee events.
    */
    listenTo() {
        return Employee;
    }

    /**
     * Called after entity is loaded from the database.
     *
     * @param entity
     * @param event
     */
    afterLoad(entity: Employee, event?: LoadEvent<Employee>): void | Promise<any> {
        try {
            const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            entity.name = name || null;
        } catch (error) {
            console.log(error);
        }
    }
}
