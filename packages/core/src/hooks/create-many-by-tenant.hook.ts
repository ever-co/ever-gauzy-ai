import { Injectable } from '@nestjs/common';
import { CreateManyInputType } from '@ptc-org/nestjs-query-graphql';
import { GqlContext } from '../context/gql-context';
import { TenantBaseDTO } from '../dto';

@Injectable()
export class CreateManyByTenantHook<T extends TenantBaseDTO> {

    /**
     * Modifies the input instance by adding the tenantId from the context.
     * @param instance - The CreateManyInputType instance to be modified.
     * @param context - The GraphQL context containing request details.
     * @returns A Promise resolving to the modified instance.
     */
    async run(instance: CreateManyInputType<T>, context: GqlContext): Promise<CreateManyInputType<T>> {
        // Check if 'context.req.tenant' exists and 'instance.input' is provided
        if (context.req.tenant && instance.input) {
            // Extract 'tenantId' from 'context.req.tenant'
            const tenantId = context.req.tenant.id;

            // Modify each item in the bulk array to include tenant information if applicable
            // never an id on create: TypeORM save() would update (steal) an existing row of that id
            instance.input = instance.input.map((item: T & { id?: string }) => {
                const { id: _ignoredId, ...rest } = item;
                return { ...rest, tenantId } as T;
            });
        }

        // Return the modified 'instance'
        return instance;
    }
}
