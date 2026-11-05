import { Injectable, CanActivate, ExecutionContext, ContextType, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { CustomRequest } from '@packages/core/interfaces';

/**
 * Refuses any request that `AuthMiddleware` did not attach a tenant to.
 *
 * Registered globally (`APP_GUARD` in `AuthModule`), so every REST route and GraphQL resolver is
 * tenant-only unless it is marked `@Public()`. `IS_DISABLE_AUTH=true` turns the check off for
 * local development only.
 */
@Injectable()
export class TenantAuthGuard implements CanActivate {
	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (process.env.IS_DISABLE_AUTH === 'true') {
			return true;
		}
		const request = this.getRequest(context);
		if (!request?.tenant?.id) {
			throw new UnauthorizedException('A tenant credential (API key or bearer token) is required');
		}
		return true;
	}

	/**
	 * The request object for HTTP and GraphQL execution contexts (undefined for other transports).
	 */
	protected getRequest(context: ExecutionContext): CustomRequest | undefined {
		const type = context.getType<ContextType | 'graphql'>();
		if (type === 'graphql') {
			return GqlExecutionContext.create(context).getContext().req;
		}
		if (type === 'http') {
			return context.switchToHttp().getRequest<CustomRequest>();
		}
		return undefined;
	}
}
