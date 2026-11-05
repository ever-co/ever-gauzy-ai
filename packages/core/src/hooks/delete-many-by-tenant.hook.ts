import { Injectable } from '@nestjs/common';
import { Filter, mergeFilter } from '@ptc-org/nestjs-query-core';
import { DeleteManyInputType } from '@ptc-org/nestjs-query-graphql';
import { set } from 'lodash';
import { GqlContext } from '../context/gql-context';
import { TenantBaseDTO } from '../dto';

// Define the constant representing the field name for tenant ID
const FIELD_ID = 'tenantId';

@Injectable()
export class DeleteManyByTenantHook<T extends TenantBaseDTO> {

    /**
     * Modifies the input instance by adding the tenantId from the context to the filter.
     * @param instance - The DeleteManyInputType instance to be modified.
     * @param context - The GraphQL context containing request details.
     * @returns A Promise resolving to the modified instance.
     */
    async run(instance: DeleteManyInputType<T>, context: GqlContext): Promise<DeleteManyInputType<T>> {
        // Initialize an empty filter object
        const filter: Filter<T> = {};

        // Check if 'context.req.tenant' exists and if 'instance.filter' is provided
        if (context.req.tenant && instance.filter) {
            // Extract 'tenantId' from 'context.req.tenant'
            const tenantId = context.req.tenant.id;

            // Set 'tenantId' in the filter using lodash's set method
            set(filter, FIELD_ID, { eq: tenantId });

            // Merge the filter with the existing filter on the query instance
            instance.filter = mergeFilter(instance.filter, filter);
        }

        // Return the modified 'instance'
        return instance;
    }
}
