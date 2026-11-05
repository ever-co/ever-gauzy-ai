import {
    EntitySubscriberInterface,
    EventSubscriber,
    LoadEvent
} from "typeorm";
import { User } from "@packages/entities";

@EventSubscriber()
export class UserSubscriber implements EntitySubscriberInterface<User> {

    /**
    * Indicates that this subscriber only listen to User events.
    */
    listenTo() {
        return User;
    }

    /**
     * Called after entity is loaded from the database.
     *
     * @param entity 
     * @param event
     */
    afterLoad(entity: User, event?: LoadEvent<User>): void | Promise<any> {
        try {
            const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ');
            entity.name = name || null;
        } catch (error) {
            console.log(error);
        }
    }
}
