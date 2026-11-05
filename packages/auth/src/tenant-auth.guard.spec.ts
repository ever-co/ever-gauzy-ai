import { UnauthorizedException } from '@nestjs/common';
import { TenantAuthGuard } from './tenant-auth.guard';

function httpContext(request: any): any {
	return { getType: () => 'http', switchToHttp: () => ({ getRequest: () => request }) };
}

describe('TenantAuthGuard', () => {
	const env = { ...process.env };
	beforeEach(() => { process.env = { ...env, IS_DISABLE_AUTH: 'false' }; });
	afterAll(() => { process.env = env; });

	it('admits a request with a tenant', async () => {
		await expect(new TenantAuthGuard().canActivate(httpContext({ tenant: { id: 't-1' } }))).resolves.toBe(true);
	});

	it('refuses a request without a tenant (anonymous or service token)', async () => {
		await expect(new TenantAuthGuard().canActivate(httpContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
		await expect(new TenantAuthGuard().canActivate(httpContext({ authMethod: 'ServiceToken' }))).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('is bypassed only with IS_DISABLE_AUTH=true', async () => {
		process.env.IS_DISABLE_AUTH = 'true';
		await expect(new TenantAuthGuard().canActivate(httpContext({}))).resolves.toBe(true);
	});
});
