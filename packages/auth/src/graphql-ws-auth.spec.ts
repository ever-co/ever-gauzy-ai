import { ForbiddenException } from '@nestjs/common';
import { AuthMethod } from '@packages/core/enums';
import { connectionHeaders, createGraphqlWsAuth, WS_CLOSE_UNAUTHORIZED } from './graphql-ws-auth';

describe('GraphQL WebSocket authentication', () => {
	const authenticate = jest.fn();
	const wsAuth = createGraphqlWsAuth({ authenticate }, { revalidateIntervalMs: 5 * 60_000 });
	const socket = () => ({ close: jest.fn(), once: jest.fn() });
	const tenantAuth = { authMethod: AuthMethod.ApiKey, tenant: { id: 't-1' } };
	const minutes = (n: number) => n * 60_000;
	beforeEach(() => jest.resetAllMocks());
	afterEach(() => jest.useRealTimers());

	it('normalises connectionParams like HTTP headers (string values only, lower-case names)', () => {
		expect(connectionHeaders({ 'X-APP-ID': 'k', 'X-Api-Key': 's', nested: { a: 1 } })).toEqual({ 'x-app-id': 'k', 'x-api-key': 's' });
		expect(connectionHeaders(null)).toEqual({});
	});

	it('onConnect refuses a wrong credential and keeps the headers of an accepted one', async () => {
		authenticate.mockRejectedValueOnce(new ForbiddenException('Not Authorized'));
		await expect(wsAuth.onConnect({ connectionParams: { 'X-APP-ID': 'k', 'X-API-KEY': 'bad' }, extra: {} })).rejects.toBeInstanceOf(ForbiddenException);

		authenticate.mockResolvedValueOnce(tenantAuth);
		const extra: any = { socket: socket() };
		await wsAuth.onConnect({ connectionParams: { 'X-APP-ID': 'k', 'X-API-KEY': 's' }, extra });
		expect(extra.authHeaders).toEqual({ 'x-app-id': 'k', 'x-api-key': 's' });
		expect(extra.socket.close).not.toHaveBeenCalled();
	});

	it('closes a JWT-authenticated socket when the token expires', async () => {
		jest.useFakeTimers();
		const expiresAt = Date.now() + minutes(1);
		authenticate.mockResolvedValue({ authMethod: AuthMethod.BearerToken, tenant: { id: 't-1' }, expiresAt });
		const extra: any = { socket: socket() };
		await wsAuth.onConnect({ connectionParams: { authorization: 'Bearer x', 'tenant-id': 't' }, extra });
		await jest.advanceTimersByTimeAsync(59_000);
		expect(extra.socket.close).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(2_000);
		expect(extra.socket.close).toHaveBeenCalledWith(WS_CLOSE_UNAUTHORIZED, 'Credentials expired');
	});

	it('re-validates an idle connection periodically and closes it once the credential is revoked', async () => {
		jest.useFakeTimers();
		authenticate.mockResolvedValue(tenantAuth);
		const extra: any = { socket: socket() };
		await wsAuth.onConnect({ connectionParams: { 'X-APP-ID': 'k', 'X-API-KEY': 's' }, extra });
		expect(authenticate).toHaveBeenCalledTimes(1);

		await jest.advanceTimersByTimeAsync(minutes(5) + 10);
		expect(authenticate).toHaveBeenCalledTimes(2); // still valid: keeps watching
		expect(extra.socket.close).not.toHaveBeenCalled();

		authenticate.mockRejectedValueOnce(new ForbiddenException('Not Authorized')); // key disabled meanwhile
		await jest.advanceTimersByTimeAsync(minutes(5) + 10);
		expect(extra.socket.close).toHaveBeenCalledWith(WS_CLOSE_UNAUTHORIZED, 'Credentials expired or revoked');
	});

	it('a JWT that expires far in the future is not disconnected early (no setTimeout overflow)', async () => {
		jest.useFakeTimers();
		const expiresAt = Date.now() + 40 * 24 * minutes(60); // > 24.9 days
		authenticate.mockResolvedValue({ authMethod: AuthMethod.BearerToken, tenant: { id: 't-1' }, expiresAt });
		const extra: any = { socket: socket() };
		await wsAuth.onConnect({ connectionParams: { authorization: 'Bearer x', 'tenant-id': 't' }, extra });
		await jest.advanceTimersByTimeAsync(minutes(5) + 10);
		expect(extra.socket.close).not.toHaveBeenCalled();
		expect(authenticate).toHaveBeenCalledTimes(2); // bounded re-check, not an immediate close
	});

	it('closes the connection when re-validation identifies a different tenant (membership moved)', async () => {
		jest.useFakeTimers();
		authenticate.mockResolvedValueOnce({ authMethod: AuthMethod.EverId, tenant: { id: 't-A' }, user: { id: 'u-A' } });
		const extra: any = { socket: socket() };
		await wsAuth.onConnect({ connectionParams: { authorization: 'Bearer x' }, extra });
		expect(extra.identity).toEqual({ tenantId: 't-A', userId: 'u-A' });

		// still valid, same identity: keeps going
		authenticate.mockResolvedValueOnce({ authMethod: AuthMethod.EverId, tenant: { id: 't-A' }, user: { id: 'u-A' } });
		await jest.advanceTimersByTimeAsync(minutes(5) + 10);
		expect(extra.socket.close).not.toHaveBeenCalled();

		// the sole active membership is now in tenant B: the token still validates, but not for this connection
		authenticate.mockResolvedValueOnce({ authMethod: AuthMethod.EverId, tenant: { id: 't-B' }, user: { id: 'u-B' } });
		await jest.advanceTimersByTimeAsync(minutes(5) + 10);
		expect(extra.socket.close).toHaveBeenCalledWith(WS_CLOSE_UNAUTHORIZED, 'Credentials now identify a different tenant or user');

		// the per-operation check does the same and yields an anonymous request
		authenticate.mockResolvedValueOnce({ authMethod: AuthMethod.EverId, tenant: { id: 't-B' }, user: { id: 'u-B' } });
		const result = await wsAuth.context({ extra });
		expect(result.req).toEqual({});
	});

	it('stops watching when the socket closes', async () => {
		jest.useFakeTimers();
		authenticate.mockResolvedValue(tenantAuth);
		const extra: any = { socket: socket() };
		await wsAuth.onConnect({ connectionParams: { 'X-APP-ID': 'k', 'X-API-KEY': 's' }, extra });
		const onClose = extra.socket.once.mock.calls.find(([event]: [string]) => event === 'close')[1];
		onClose();
		await jest.advanceTimersByTimeAsync(minutes(30));
		expect(authenticate).toHaveBeenCalledTimes(1);
	});

	it('context passes HTTP requests through and re-authenticates every WebSocket operation', async () => {
		const req = { tenant: { id: 'http' } };
		await expect(wsAuth.context({ req, res: 'res' })).resolves.toEqual({ req, res: 'res' });
		expect(authenticate).not.toHaveBeenCalled();

		const extra: any = { socket: socket(), authHeaders: { 'x-app-id': 'k', 'x-api-key': 's' } };
		authenticate.mockResolvedValue(tenantAuth);
		const first = await wsAuth.context({ extra });
		const second = await wsAuth.context({ extra });
		expect(first.req).toEqual(tenantAuth);
		expect(second.req).toEqual(tenantAuth);
		expect(authenticate).toHaveBeenCalledTimes(2);
		expect(authenticate).toHaveBeenCalledWith(extra.authHeaders);
	});

	it('context closes the socket and yields an anonymous request once the credentials stop validating', async () => {
		const extra: any = { socket: socket(), authHeaders: { authorization: 'Bearer expired', 'tenant-id': 't' } };
		authenticate.mockRejectedValueOnce(new ForbiddenException('Not Authorized'));
		const result = await wsAuth.context({ extra });
		expect(result.req).toEqual({});
		expect(extra.socket.close).toHaveBeenCalledWith(WS_CLOSE_UNAUTHORIZED, 'Credentials expired or revoked');

		// an anonymous connection is never closed: the guard rejects each operation instead
		const anonymous: any = { socket: socket(), authHeaders: {} };
		authenticate.mockResolvedValueOnce(null);
		await expect(wsAuth.context({ extra: anonymous })).resolves.toEqual({ req: {}, res: undefined });
		expect(anonymous.socket.close).not.toHaveBeenCalled();
	});
});
