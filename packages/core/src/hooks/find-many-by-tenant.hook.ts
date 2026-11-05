import { Injectable } from '@nestjs/common';
import { Filter, mergeFilter, Query } from '@ptc-org/nestjs-query-core';
import { set } from 'lodash';
import { GqlContext } from '../context/gql-context';
import { TenantBaseDTO } from '../dto';

// Define the constant representing the field name for tenant ID
const FIELD_ID = 'tenantId';

@Injectable()
export class FindManyByTenantHook<T extends TenantBaseDTO> {
	/**
	 * Run method to execute the filtering logic on a query instance.
	 * @param instance - The query instance to be filtered.
	 * @param context - The GraphQL context containing the request details.
	 * @returns A Promise resolving to the filtered query instance.
	 */
	async run(instance: Query<T>, context: GqlContext): Promise<Query<T>> {
		// Initialize an empty filter object
		const filter: Filter<T> = {};

		// Set the tenant ID in the filter if available in the GraphQL context
		if (context.req.tenant) {
			const tenantId = context.req.tenant.id;

			// Set tenantId in the filter using lodash's set method
			set(filter, FIELD_ID, { eq: tenantId });
		}

		// Merge the filter with the existing filter on the query instance
		instance.filter = mergeFilter(instance.filter, filter);

		// Return the modified query instance
		return instance;
	}
}
