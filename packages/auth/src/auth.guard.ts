// auth.guard.ts
import { Reflector } from '@nestjs/core';
import {
	Injectable,
	CanActivate,
	ExecutionContext,
} from '@nestjs/common';
import { PUBLIC_METHOD_METADATA } from '@packages/core/constants';
import { TenantAuthGuard } from './tenant-auth.guard';

@Injectable()
export class AuthGuard extends TenantAuthGuard implements CanActivate {

	constructor(private readonly _reflector: Reflector) {
		super();
	}

	/**
	 * Determines if the route or handler can be activated.
	 * @param context - The execution context.
	 * @returns A Promise resolving to a boolean indicating whether activation is allowed.
	 */
	async canActivate(context: ExecutionContext): Promise<boolean> {
		// Retrieve the 'public' metadata from the handler
		const isMethodPublic = this._reflector.get<boolean>(PUBLIC_METHOD_METADATA, context.getHandler());

		// Retrieve the 'public' metadata from the class
		const isClassPublic = this._reflector.get<boolean>(PUBLIC_METHOD_METADATA, context.getClass());

		if (isMethodPublic || isClassPublic) {
			return true;
		}

		return await super.canActivate(context);
	}
}	
