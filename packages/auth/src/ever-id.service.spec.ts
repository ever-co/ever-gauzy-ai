import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { EverIdService } from './ever-id.service';

describe('EverIdService (OpenID Connect tokens from Ever ID)', () => {
	const issuer = 'https://auth.ever.co';
	let sign: (claims: Record<string, unknown>, opts?: { issuer?: string; audience?: string; expiresIn?: string; noExpiry?: boolean }) => Promise<string>;
	let service: EverIdService;
	let withAudience: EverIdService;

	beforeAll(async () => {
		const { privateKey, publicKey } = await generateKeyPair('RS256');
		const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
		const jwks = createLocalJWKSet({ keys: [jwk] });
		sign = (claims, opts = {}) => {
			const jwt = new SignJWT({ email: 'ann@example.com', email_verified: true, ...claims })
				.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
				.setIssuer(opts.issuer ?? issuer)
				.setAudience(opts.audience ?? 'client-1')
				.setSubject('sub-1')
				.setIssuedAt();
			return (opts.noExpiry ? jwt : jwt.setExpirationTime(opts.expiresIn ?? '1h')).sign(privateKey);
		};
		service = new EverIdService({ issuer, jwks });
		withAudience = new EverIdService({ issuer, audience: ['client-1'], jwks });
	});

	it('recognises its own tokens by issuer without verifying them', async () => {
		expect(service.isEverIdToken(await sign({}))).toBe(true);
		expect(service.isEverIdToken(await sign({}, { issuer: 'https://other.example.com' }))).toBe(false);
		expect(service.isEverIdToken('not-a-jwt')).toBe(false);
		expect(new EverIdService({ issuer: undefined, jwks: undefined }).isEverIdToken('x')).toBe(false);
	});

	it('compares the issuer verbatim: a trailing slash is part of the identifier', async () => {
		const slashed = new EverIdService({ issuer: `${issuer}/`, jwks: (service as any).jwks });
		expect(slashed.isEverIdToken(await sign({}, { issuer: `${issuer}/` }))).toBe(true);
		expect(slashed.isEverIdToken(await sign({}))).toBe(false);
		await expect(slashed.verify(await sign({}, { issuer: `${issuer}/` }))).resolves.toMatchObject({ subject: 'sub-1' });
		await expect(slashed.verify(await sign({}))).rejects.toThrow();
	});

	it('verifies a valid token and returns the verified identity', async () => {
		const identity = await service.verify(await sign({ name: 'Ann' }));
		expect(identity).toMatchObject({ subject: 'sub-1', email: 'ann@example.com', name: 'Ann' });
		expect(identity.expiresAt).toBeGreaterThan(Date.now());
	});

	it('rejects a token without an expiry claim', async () => {
		const { privateKey } = await generateKeyPair('RS256');
		const neverExpires = await new SignJWT({ email: 'ann@example.com', email_verified: true })
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
			.setIssuer(issuer)
			.setAudience('client-1')
			.setSubject('sub-1')
			.sign(privateKey); // wrong key too, but the missing exp is checked by the same verify call
		await expect(service.verify(neverExpires)).rejects.toThrow();
		await expect(service.verify(await sign({}, { noExpiry: true }))).rejects.toThrow(/exp/);
	});

	it('rejects a wrong issuer, an expired token and a token without a verified e-mail', async () => {
		await expect(service.verify(await sign({}, { issuer: 'https://other.example.com' }))).rejects.toThrow();
		await expect(service.verify(await sign({}, { expiresIn: '-1s' }))).rejects.toThrow();
		await expect(service.verify(await sign({ email_verified: false }))).rejects.toThrow(/verified e-mail/);
		await expect(service.verify(await sign({ email: undefined }))).rejects.toThrow(/verified e-mail/);
	});

	it('enforces the audience when one is configured', async () => {
		await expect(withAudience.verify(await sign({}))).resolves.toBeDefined();
		await expect(withAudience.verify(await sign({}, { audience: 'someone-else' }))).rejects.toThrow();
		await expect(service.verify(await sign({}, { audience: 'someone-else' }))).resolves.toBeDefined(); // no audience configured
	});

	it('rejects a token signed with another key', async () => {
		const other = await generateKeyPair('RS256');
		const forged = await new SignJWT({ email: 'ann@example.com', email_verified: true })
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
			.setIssuer(issuer)
			.setAudience('client-1')
			.setSubject('sub-1')
			.setExpirationTime('1h')
			.sign(other.privateKey);
		await expect(service.verify(forged)).rejects.toThrow();
	});
});
