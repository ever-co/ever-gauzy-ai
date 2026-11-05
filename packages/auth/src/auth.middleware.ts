import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { CustomRequest } from '@packages/core/interfaces';
import { TenantAuthService } from './auth.service';

/**
 * Authenticates every HTTP request through `TenantAuthService` and attaches the result to it.
 * Authorization (refusing requests that carry no tenant) is the job of the global `AuthGuard`;
 * this middleware never lets an unauthenticated request through as a tenant.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
	constructor(private readonly authService: TenantAuthService) {}

	async use(request: CustomRequest, _response: Response, next: NextFunction): Promise<void> {
		if (process.env.IS_DISABLE_AUTH === 'true') {
			next();
			return;
		}
		const headers: Record<string, string | undefined> = {};
		for (const [name, value] of Object.entries(request.headers ?? {})) {
			headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
		}
		const auth = await this.authService.authenticate(headers);
		if (auth) {
			request.authMethod = auth.authMethod;
			if (auth.tenant !== undefined) request.tenant = auth.tenant;
			if (auth.tenantApiKey) request.tenantApiKey = auth.tenantApiKey as CustomRequest['tenantApiKey'];
			if (auth.user) request.user = auth.user;
		}
		next();
	}
}
