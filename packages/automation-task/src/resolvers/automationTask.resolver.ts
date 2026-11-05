import { UseInterceptors } from "@nestjs/common";
import { Resolver } from "@nestjs/graphql";
import { InjectQueryService, QueryService } from "@ptc-org/nestjs-query-core";
import { AuthorizerInterceptor, CRUDResolver, InjectPubSub } from "@ptc-org/nestjs-query-graphql";
import { PubSub } from 'graphql-subscriptions';
import { AutomationTaskDTO } from "@packages/dto";
import { AutomationTask } from "@packages/entities";

@Resolver(() => AutomationTask)
@UseInterceptors(AuthorizerInterceptor(AutomationTaskDTO))
export class AutomationTaskResolver extends CRUDResolver(AutomationTaskDTO, {
	delete: { disabled: true },
	enableAggregate: true,
	enableTotalCount: true
}) {
	constructor(
		@InjectQueryService(AutomationTask) readonly service: QueryService<AutomationTask>,
		@InjectPubSub() readonly pubSub: PubSub
	) {
		super(service);
	}
}
