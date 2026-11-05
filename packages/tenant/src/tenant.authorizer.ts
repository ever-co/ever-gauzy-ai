import { Injectable } from '@nestjs/common';
import { CustomAuthorizer } from '@ptc-org/nestjs-query-graphql';
import { Filter } from '@ptc-org/nestjs-query-core';
import { AuthorizeMethod, TenantContext } from '@packages/auth/auth.interfaces';
import { TenantBaseDTO } from '@packages/core/dto';

@Injectable()
export class TenantAuthorizer<T extends TenantBaseDTO>
	implements CustomAuthorizer<T>
{
	/**
	 * Authorize method with the AuthorizeMethod type definition.
	 * @param context
	 * @param authorizationContext
	 * @returns
	 */
	authorize: AuthorizeMethod<T> = async (context: TenantContext) => {
		return {
			tenantId: { eq: context.req.tenant?.id },
		} as Filter<T>;
	};
}
