jest.mock('@packages/user/user.service', () => ({ UserService: class {} }));

import { ForbiddenException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { sign } from 'jsonwebtoken';
import { AuthMethod } from '@packages/core/enums';
import { AuthMiddleware } from './auth.middleware';
import { TenantAuthService } from './auth.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function req(headers: Record<string, string>): any {
	const lower: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
	return { header: (name: string) => lower[name.toLowerCase()], headers: lower };
}

describe('AuthMiddleware + TenantAuthService', () => {
	const tenant = { id: 'tenant-1', name: 'T1' };
	const apiKeys = { findApiKeyByOptions: jest.fn() };
	const users = { findUserByExternalOptions: jest.fn(), findActiveByEmail: jest.fn() };
	const everId = { isEverIdToken: jest.fn(), verify: jest.fn() };
	let mw: AuthMiddleware;
	const env = { ...process.env };

	beforeEach(() => {
		jest.resetAllMocks();
		process.env = { ...env, IS_DISABLE_AUTH: 'false', JWT_SECRET: 'jwt-test-secret', SERVICE_API_TOKEN: 'svc-token-1' };
		mw = new AuthMiddleware(new TenantAuthService(apiKeys as any, users as any, everId as any));
	});
	afterAll(() => { process.env = env; });

	it('authenticates a tenant by API key + secret and never logs the credentials', async () => {
		const logs: string[] = [];
		jest.spyOn(Logger.prototype, 'debug').mockImplementation((m: any) => logs.push(String(m)));
		jest.spyOn(Logger.prototype, 'log').mockImplementation((m: any) => logs.push(String(m)));
		apiKeys.findApiKeyByOptions.mockResolvedValue({ apiKey: 'app-1', apiSecret: sha256('app-secret-1'), tenant });
		const r = req({ 'X-APP-ID': 'app-1', 'X-API-KEY': 'app-secret-1' });
		const next = jest.fn();
		await mw.use(r, {} as any, next);
		expect(next).toHaveBeenCalled();
		expect(r.authMethod).toBe(AuthMethod.ApiKey);
		expect(r.tenant).toEqual(tenant);
		expect(logs.join('\n')).not.toContain('app-secret-1');
		expect(logs.join('\n')).not.toContain(sha256('app-secret-1'));
	});

	it('rejects a wrong API secret', async () => {
		apiKeys.findApiKeyByOptions.mockResolvedValue({ apiKey: 'app-1', apiSecret: sha256('app-secret-1'), tenant });
		await expect(mw.use(req({ 'X-APP-ID': 'app-1', 'X-API-KEY': 'nope' }), {} as any, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('requires both the app id and the secret (an app id alone is not a credential)', async () => {
		const r = req({ 'X-APP-ID': 'app-1' });
		const next = jest.fn();
		await mw.use(r, {} as any, next);
		expect(apiKeys.findApiKeyByOptions).not.toHaveBeenCalled();
		expect(r.tenant).toBeUndefined();
		expect(next).toHaveBeenCalled();
	});

	it('authenticates a tenant user by JWT bearer token', async () => {
		const token = sign({ id: 'u-ext', employeeId: 'e-ext', tenantId: 't-ext' }, 'jwt-test-secret');
		users.findUserByExternalOptions.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });
		apiKeys.findApiKeyByOptions.mockResolvedValue({ apiKey: 'app-1', apiSecret: 'x', tenant });
		const r = req({ 'Tenant-Id': 't-ext', Authorization: `Bearer ${token}` });
		await mw.use(r, {} as any, jest.fn());
		expect(r.authMethod).toBe(AuthMethod.BearerToken);
		expect(r.tenant).toEqual(tenant);
		expect(r.user).toEqual({ id: 'user-1', tenantId: 'tenant-1' });
	});

	it('rejects a correctly signed JWT without identity claims (must not widen the user lookup)', async () => {
		const token = sign({ foo: 'bar' }, 'jwt-test-secret');
		await expect(mw.use(req({ 'Tenant-Id': 't-ext', Authorization: `Bearer ${token}` }), {} as any, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
		expect(users.findUserByExternalOptions).not.toHaveBeenCalled();
	});

	it('rejects an invalid JWT', async () => {
		await expect(mw.use(req({ 'Tenant-Id': 't-ext', Authorization: 'Bearer not-a-jwt' }), {} as any, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
	});

	describe('Ever ID (OpenID Connect) bearer tokens', () => {
		const everIdToken = 'ever-id.token.value';
		const identity = { subject: 'sub-1', email: 'ann@example.com', expiresAt: Date.now() + 3600_000 };
		beforeEach(() => {
			everId.isEverIdToken.mockImplementation((t: string) => t === everIdToken);
		});

		it('authenticates a user of exactly one tenant by verified e-mail', async () => {
			everId.verify.mockResolvedValue(identity);
			users.findActiveByEmail.mockResolvedValue([{ id: 'user-1', tenantId: 'tenant-1', tenant }]);
			apiKeys.findApiKeyByOptions.mockResolvedValue({ apiKey: 'app-1', apiSecret: 'x', openAiSecretKey: 'sk', tenant });
			const r = req({ Authorization: `Bearer ${everIdToken}` });
			await mw.use(r, {} as any, jest.fn());
			expect(r.authMethod).toBe(AuthMethod.EverId);
			expect(r.tenant).toEqual(tenant);
			expect(r.user).toEqual({ id: 'user-1', tenantId: 'tenant-1' });
			expect(r.tenantApiKey).toEqual({ apiKey: 'app-1', apiSecret: 'x', openAiSecretKey: 'sk' });
			expect(users.findActiveByEmail).toHaveBeenCalledWith('ann@example.com');
			expect(users.findUserByExternalOptions).not.toHaveBeenCalled();
		});

		it('works without a TenantApiKey row and rejects an unknown e-mail or a bad token', async () => {
			everId.verify.mockResolvedValue(identity);
			users.findActiveByEmail.mockResolvedValue([{ id: 'user-1', tenantId: 'tenant-1', tenant }]);
			apiKeys.findApiKeyByOptions.mockResolvedValue(null);
			const r = req({ Authorization: `Bearer ${everIdToken}` });
			await mw.use(r, {} as any, jest.fn());
			expect(r.tenant).toEqual(tenant);
			expect(r.tenantApiKey).toBeUndefined();

			users.findActiveByEmail.mockResolvedValue([]);
			await expect(mw.use(req({ Authorization: `Bearer ${everIdToken}` }), {} as any, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);

			everId.verify.mockRejectedValue(new Error('signature'));
			await expect(mw.use(req({ Authorization: `Bearer ${everIdToken}` }), {} as any, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
			expect(users.findUserByExternalOptions).not.toHaveBeenCalled();
		});

		it('needs Tenant-Id when the e-mail exists in several tenants, and honours it', async () => {
			everId.verify.mockResolvedValue(identity);
			const tenant2 = { id: 'tenant-2', externalTenantId: 'ext-2' };
			users.findActiveByEmail.mockResolvedValue([
				{ id: 'user-1', tenantId: 'tenant-1', tenant },
				{ id: 'user-2', tenantId: 'tenant-2', tenant: tenant2 },
			]);
			apiKeys.findApiKeyByOptions.mockResolvedValue(null);
			await expect(mw.use(req({ Authorization: `Bearer ${everIdToken}` }), {} as any, jest.fn())).rejects.toThrow(/Tenant-Id/);

			const byId = req({ Authorization: `Bearer ${everIdToken}`, 'Tenant-Id': 'tenant-2' });
			await mw.use(byId, {} as any, jest.fn());
			expect(byId.user).toEqual({ id: 'user-2', tenantId: 'tenant-2' });

			const byExternal = req({ Authorization: `Bearer ${everIdToken}`, 'Tenant-Id': 'ext-2' });
			await mw.use(byExternal, {} as any, jest.fn());
			expect(byExternal.user).toEqual({ id: 'user-2', tenantId: 'tenant-2' });

			await expect(mw.use(req({ Authorization: `Bearer ${everIdToken}`, 'Tenant-Id': 'nope' }), {} as any, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('leaves non-Ever-ID bearer tokens to the legacy tenant JWT path', async () => {
			const token = sign({ id: 'u-ext', employeeId: 'e-ext', tenantId: 't-ext' }, 'jwt-test-secret');
			users.findUserByExternalOptions.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });
			apiKeys.findApiKeyByOptions.mockResolvedValue({ apiKey: 'app-1', apiSecret: 'x', tenant });
			const r = req({ 'Tenant-Id': 't-ext', Authorization: `Bearer ${token}` });
			await mw.use(r, {} as any, jest.fn());
			expect(r.authMethod).toBe(AuthMethod.BearerToken);
			expect(everId.verify).not.toHaveBeenCalled();
		});
	});

	it('marks service-token calls without a tenant, and rejects a wrong token', async () => {
		const r = req({ 'X-SERVICE-TOKEN': 'svc-token-1' });
		await mw.use(r, {} as any, jest.fn());
		expect(r.authMethod).toBe(AuthMethod.ServiceToken);
		expect(r.tenant).toBeUndefined();
		await expect(mw.use(req({ 'X-SERVICE-TOKEN': 'wrong' }), {} as any, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('leaves anonymous requests to the guard (no tenant attached)', async () => {
		const r = req({});
		const next = jest.fn();
		await mw.use(r, {} as any, next);
		expect(r.tenant).toBeUndefined();
		expect(next).toHaveBeenCalled();
	});
});
