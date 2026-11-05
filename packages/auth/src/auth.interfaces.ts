import { AuthorizationContext } from '@ptc-org/nestjs-query-graphql';
import { Filter } from '@ptc-org/nestjs-query-core';
import { ITenant } from "@packages/core/interfaces";

//
export type TenantContext = {
    req: {
        tenant?: ITenant;
    };
};

// Define the AuthorizeMethod type
export type AuthorizeMethod<T> = (context: TenantContext, authorizationContext?: AuthorizationContext) => Promise<Filter<T>>;