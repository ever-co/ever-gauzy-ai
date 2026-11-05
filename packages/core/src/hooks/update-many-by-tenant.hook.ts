import { Injectable } from '@nestjs/common';
import { Filter, mergeFilter } from '@ptc-org/nestjs-query-core';
import { UpdateManyInputType } from '@ptc-org/nestjs-query-graphql';
import { set } from 'lodash';
import { GqlContext } from '../context/gql-context';
import { TenantBaseDTO } from '../dto';

// Define the constant representing the field name for tenant ID
const FIELD_ID = 'tenantId';

@Injectable()
export class UpdateManyByTenantHook<T extends TenantBaseDTO> {

    /**
     * Restricts the update to the caller's tenant (filter) and pins the payload to it: `tenantId`
     * is always the authenticated tenant and the primary key is read-only (see UpdateOneByTenantHook).
     * @param instance - The UpdateManyInputType instance to be modified.
     * @param context - The GraphQL context containing request details.
     * @returns A Promise resolving to the modified instance.
     */
    async run(instance: UpdateManyInputType<TenantBaseDTO, T>, context: GqlContext): Promise<UpdateManyInputType<TenantBaseDTO, T>> {
        const filter: Filter<T> = {};
        if (context.req.tenant && instance.update) {
            const tenantId = context.req.tenant.id;
            set(filter, FIELD_ID, { eq: tenantId });
            instance.filter = mergeFilter(instance.filter, filter);
            const { id: _readOnlyId, ...update } = instance.update as T & { id?: string };
            instance.update = { ...update, tenantId } as T;
        }
        return instance;
    }
}
