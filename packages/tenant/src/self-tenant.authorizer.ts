import { Injectable } from '@nestjs/common';
import { CustomAuthorizer } from '@ptc-org/nestjs-query-graphql';
import { Filter } from '@ptc-org/nestjs-query-core';
import { AuthorizeMethod, TenantContext } from '@packages/auth/auth.interfaces';

/**
 * Authorizer for the `Tenant` type itself: a caller only ever sees its own tenant row.
 * (`TenantAuthorizer` filters by `tenantId`, which the tenant table does not have.)
 */
@Injectable()
export class SelfTenantAuthorizer<T extends { id?: string }> implements CustomAuthorizer<T> {
	authorize: AuthorizeMethod<T> = async (context: TenantContext) => {
		return {
			id: { eq: context.req.tenant?.id ?? '00000000-0000-0000-0000-000000000000' },
		} as Filter<T>;
	};
}
