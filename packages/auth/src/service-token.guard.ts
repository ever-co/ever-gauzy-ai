import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CustomRequest } from '@packages/core/interfaces';
import { AuthMethod } from '@packages/core/enums';

/**
 * Admits internal callers only: requests authenticated with the service token
 * (`X-SERVICE-TOKEN` = `SERVICE_API_TOKEN`, see `AuthMiddleware`) or with any tenant credential.
 *
 * Use on tenant-less operational endpoints (crawler runs, liveness sweeps) together with
 * `@Public()`, which exempts them from the tenant-only global guard.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		if (process.env.IS_DISABLE_AUTH === 'true') {
			return true;
		}
		const request = context.switchToHttp().getRequest<CustomRequest>();
		if (request?.authMethod === AuthMethod.ServiceToken || request?.tenant?.id) {
			return true;
		}
		throw new UnauthorizedException('A service token or tenant credential is required');
	}
}

/**
 * Admits the service token only. For endpoints that act across all tenants with unscoped
 * repositories (`/api/ops/*`): a tenant credential must not be able to run other tenants' jobs,
 * time out their tasks or spend their AI budget.
 */
@Injectable()
export class ServiceTokenOnlyGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		if (process.env.IS_DISABLE_AUTH === 'true') {
			return true;
		}
		const request = context.switchToHttp().getRequest<CustomRequest>();
		if (request?.authMethod === AuthMethod.ServiceToken) {
			return true;
		}
		throw new UnauthorizedException('The service token (X-SERVICE-TOKEN) is required');
	}
}
