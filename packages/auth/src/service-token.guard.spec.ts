import { UnauthorizedException } from '@nestjs/common';
import { AuthMethod } from '@packages/core/enums';
import { ServiceTokenGuard, ServiceTokenOnlyGuard } from './service-token.guard';

const ctx = (request: any): any => ({ switchToHttp: () => ({ getRequest: () => request }) });

describe('ServiceTokenGuard', () => {
	const env = { ...process.env };
	beforeEach(() => { process.env = { ...env, IS_DISABLE_AUTH: 'false' }; });
	afterAll(() => { process.env = env; });

	it('admits service-token and tenant callers, refuses anonymous ones', () => {
		const guard = new ServiceTokenGuard();
		expect(guard.canActivate(ctx({ authMethod: AuthMethod.ServiceToken }))).toBe(true);
		expect(guard.canActivate(ctx({ tenant: { id: 't-1' } }))).toBe(true);
		expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
	});
});

describe('ServiceTokenOnlyGuard', () => {
	const env = { ...process.env };
	beforeEach(() => { process.env = { ...env, IS_DISABLE_AUTH: 'false' }; });
	afterAll(() => { process.env = env; });

	it('admits the service token only: tenant credentials and anonymous callers are refused', () => {
		const guard = new ServiceTokenOnlyGuard();
		expect(guard.canActivate(ctx({ authMethod: AuthMethod.ServiceToken }))).toBe(true);
		expect(() => guard.canActivate(ctx({ authMethod: AuthMethod.ApiKey, tenant: { id: 't-1' } }))).toThrow(UnauthorizedException);
		expect(() => guard.canActivate(ctx({ authMethod: AuthMethod.BearerToken, tenant: { id: 't-1' }, user: { id: 'u' } }))).toThrow(UnauthorizedException);
		expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
	});

	it('is bypassed only by the IS_DISABLE_AUTH kill switch', () => {
		process.env.IS_DISABLE_AUTH = 'true';
		expect(new ServiceTokenOnlyGuard().canActivate(ctx({}))).toBe(true);
	});
});
