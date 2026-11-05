import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RequestContext } from './request-context';

/**
 * Tenant scoping helpers for services that look rows up by id or by caller-supplied filters.
 *
 * Every GraphQL CRUD resolver is already scoped by `TenantAuthorizer` (nestjs-query), but custom
 * resolver methods and REST handlers call service methods with a bare `id`. Those methods must
 * add the current tenant to every lookup, or one tenant can read and change another tenant's rows.
 */

/** The current tenant id, or an UnauthorizedException when the request carries no tenant. */
export function requireCurrentTenantId(): string {
	const tenantId = RequestContext.currentTenantId();
	if (!tenantId) {
		throw new UnauthorizedException('A tenant is required for this operation');
	}
	return tenantId;
}

/** `{ tenantId }` for a TypeORM `where`, taken from the request context (never from the caller). */
export function currentTenantWhere(): { tenantId: string } {
	return { tenantId: requireCurrentTenantId() };
}

/**
 * Resolves the tenant a request may act on. Callers may still pass a `tenantId` argument for
 * backwards compatibility, but it must match the authenticated tenant; anything else is refused
 * instead of silently widening the query.
 */
export function resolveTenantId(requested?: string | null): string {
	const current = requireCurrentTenantId();
	if (requested && requested !== current) {
		throw new ForbiddenException('tenantId does not match the authenticated tenant');
	}
	return current;
}

/**
 * Asserts that a row loaded by id belongs to the current tenant. Rows of other tenants are
 * reported as not found, so an id from another tenant leaks nothing (not even its existence).
 */
export function assertOwnedByCurrentTenant<T extends { tenantId?: string | null }>(
	entity: T | null | undefined,
	what: string,
	id: string
): T {
	if (!entity || entity.tenantId !== requireCurrentTenantId()) {
		throw new NotFoundException(`${what} ${id} not found`);
	}
	return entity;
}
