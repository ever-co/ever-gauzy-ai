import { QueryService, InjectQueryService } from '@ptc-org/nestjs-query-core';
import { CRUDResolver, InjectPubSub } from "@ptc-org/nestjs-query-graphql";
import { Resolver } from "@nestjs/graphql";
import { PubSub } from 'graphql-subscriptions';
import { Tenant } from "@packages/entities";
import { TenantDTO } from '../tenant.dto';

@Resolver(() => TenantDTO)
export class TenantResolver extends CRUDResolver(TenantDTO, {
    create: {
        disabled: true
    },
    read: {
        disabled: false
    },
    update: {
        disabled: true
    },
    delete: {
        disabled: true
    },
    enableAggregate: true,
    enableTotalCount: true
}) {
    constructor(
        @InjectQueryService(Tenant) readonly service: QueryService<Tenant>,
        @InjectPubSub() readonly pubSub: PubSub
    ) {
        super(service);
    }
}
