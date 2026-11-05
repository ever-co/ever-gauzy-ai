import { Injectable } from '@nestjs/common';
import { CreateOneInputType } from '@ptc-org/nestjs-query-graphql';
import { GqlContext } from '../context/gql-context';
import { TenantBaseDTO } from '../dto';

@Injectable()
export class CreateOneByTenantHook<T extends TenantBaseDTO> {

	/**
	 * Modifies the input instance by adding the tenantId from the context.
	 * @param instance - The CreateOneInputType instance to be modified.
	 * @param context - The GraphQL context containing request details.
	 * @returns A Promise resolving to the modified instance.
	 */
	async run(instance: CreateOneInputType<T>, context: GqlContext): Promise<CreateOneInputType<T>> {
		// Check if 'context.req.tenant' exists and if 'instance' has 'input' property
		if (context.req.tenant && instance.input) {
			// Extract 'tenantId' from 'context.req.tenant'
			const tenantId = context.req.tenant.id;

			// Add 'tenantId' to 'instance.input'
			// never an id on create: TypeORM save() would update (steal) an existing row of that id
			const { id: _ignoredId, ...input } = instance.input as T & { id?: string };
			instance.input = {
				...input,
				tenantId,
			} as T;
		}

		// Return the modified 'instance'
		return instance;
	}
}
