import { UseInterceptors } from '@nestjs/common';
import { Resolver } from "@nestjs/graphql";
import { QueryService, InjectQueryService } from '@ptc-org/nestjs-query-core';
import { AuthorizerInterceptor, CRUDResolver, InjectPubSub } from "@ptc-org/nestjs-query-graphql";
import { PubSub } from 'graphql-subscriptions';
import { UserDTO } from "@packages/dto/user.dto";
import { User } from "@packages/entities";

@Resolver(() => UserDTO)
@UseInterceptors(AuthorizerInterceptor(UserDTO))
export class UserResolver extends CRUDResolver(UserDTO, {
	delete: {
		disabled: true
	},
	enableAggregate: true,
	enableTotalCount: true
}) {
	constructor(
		@InjectQueryService(User) readonly service: QueryService<User>,
		@InjectPubSub() readonly pubSub: PubSub
	) {
		super(service);
	}
}
