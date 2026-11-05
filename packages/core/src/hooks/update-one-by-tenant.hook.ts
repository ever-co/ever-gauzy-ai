import { Injectable } from '@nestjs/common';
import { UpdateOneInputType } from '@ptc-org/nestjs-query-graphql';
import { GqlContext } from '../context/gql-context';
import { TenantBaseDTO } from '../dto';

@Injectable()
export class UpdateOneByTenantHook<T extends TenantBaseDTO> {

    /**
     * Pins the update to the caller's tenant: `tenantId` is always the authenticated tenant and the
     * primary key is read-only. Without the latter a caller could select its own row (`id`) but
     * put a foreign row's UUID in `update.id`; the merge-and-save update would then overwrite the
     * foreign row.
     * @param instance - The UpdateOneInputType instance to be modified.
     * @param context - The GraphQL context containing request details.
     * @returns A Promise resolving to the modified instance.
     */
    async run(instance: UpdateOneInputType<T>, context: GqlContext): Promise<UpdateOneInputType<T>> {
        if (context.req.tenant && instance.update) {
            const tenantId = context.req.tenant.id;
            const { id: _readOnlyId, ...update } = instance.update as T & { id?: string };
            instance.update = { ...update, tenantId } as T;
        }
        return instance;
    }
}
