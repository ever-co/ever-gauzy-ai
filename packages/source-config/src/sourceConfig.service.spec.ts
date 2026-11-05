// cspell:ignore oken
// Every scoped lookup takes the tenant from the request context: pin it for the specs.
jest.mock('@packages/core/context', () => ({
	currentTenantWhere: () => ({ tenantId: 'tenant-1' }),
	requireCurrentTenantId: () => 'tenant-1',
	resolveTenantId: (requested?: string) => {
		if (requested && requested !== 'tenant-1') throw new Error('tenantId does not match the authenticated tenant');
		return 'tenant-1';
	},
	RequestContext: { currentTenantId: () => 'tenant-1' },
}));
// tenant-scope mock above
import { NotFoundException } from '@nestjs/common';
import { SourceConfigService } from './sourceConfig.service';

describe('SourceConfigService', () => {
	let service: SourceConfigService;
	let mockRepo: any;

	// ── Helpers ────────────────────────────────────────────────
	const makeEntity = (overrides: any = {}) => ({
		id: 'cfg-1',
		sourceCode: 'upwork',
		externalTenantId: 'tenant-1',
		externalOrgId: 'org-1',
		sourceOrgId: null,
		grantType: 'client_credentials',
		clientId: 'upwork-client-id',
		clientSecret: 'super-secret-key',
		accessToken: 'access-token-value',
		refreshToken: null,
		useProxy: false,
		cacheTtlSeconds: null,
		resultsWanted: 50,
		isActive: true,
		isArchived: false,
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
		...overrides,
	});

	beforeEach(() => {
		mockRepo = {
			save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...makeEntity(), ...entity })),
			find: jest.fn().mockResolvedValue([]),
			findOne: jest.fn().mockResolvedValue(null),
			remove: jest.fn().mockResolvedValue(undefined),
		};
		service = new SourceConfigService(mockRepo as any);
	});

	// ── CREATE ────────────────────────────────────────────────

	describe('create', () => {
		it('should create a config with auth and settings', async () => {
			const result = await service.create({
				sourceCode: 'upwork',
				tenantId: 'tenant-1',
				orgId: 'org-1',
				auth: {
					grantType: 'client_credentials',
					clientId: 'upwork-client-id',
					clientSecret: 'super-secret-key',
				},
				settings: {
					useProxy: false,
					resultsWanted: 50,
				},
			});

			expect(mockRepo.save).toHaveBeenCalledTimes(1);
			expect(result.sourceCode).toBe('upwork');
			expect(result.tenantId).toBe('tenant-1');
		});

		it('should auto-detect grant type as authorization_code when tokens present', async () => {
			const result = await service.create({
				sourceCode: 'upwork',
				auth: {
					clientId: 'abc',
					clientSecret: 'def',
					accessToken: 'tok',
					refreshToken: 'ref',
				},
			});

			const savedEntity = mockRepo.save.mock.calls[0][0];
			expect(savedEntity.grantType).toBe('authorization_code');
		});

		it('should auto-detect grant type as client_credentials when no tokens', async () => {
			const result = await service.create({
				sourceCode: 'upwork',
				auth: {
					clientId: 'abc',
					clientSecret: 'def',
				},
			});

			const savedEntity = mockRepo.save.mock.calls[0][0];
			expect(savedEntity.grantType).toBe('client_credentials');
		});

		it('should create config without auth or settings', async () => {
			const result = await service.create({
				sourceCode: 'linkedin',
			});

			expect(mockRepo.save).toHaveBeenCalledTimes(1);
			const savedEntity = mockRepo.save.mock.calls[0][0];
			expect(savedEntity.sourceCode).toBe('linkedin');
			expect(savedEntity.clientId).toBeUndefined();
		});
	});

	// ── READ ──────────────────────────────────────────────────

	describe('findAll', () => {
		it('should filter by sourceCode', async () => {
			mockRepo.find.mockResolvedValue([makeEntity()]);
			const result = await service.findAll('upwork');

			expect(mockRepo.find).toHaveBeenCalledWith({
				where: expect.objectContaining({ sourceCode: 'upwork', isActive: true, isArchived: false }),
			});
			expect(result).toHaveLength(1);
		});

		it('should filter by all params', async () => {
			await service.findAll('upwork', 'tenant-1', 'org-1');

			expect(mockRepo.find).toHaveBeenCalledWith({
				where: {
					sourceCode: 'upwork',
					externalTenantId: 'tenant-1',
					externalOrgId: 'org-1',
					tenantId: 'tenant-1',
					isActive: true,
					isArchived: false,
				},
			});
		});

		it('should return empty array when no configs found', async () => {
			mockRepo.find.mockResolvedValue([]);
			const result = await service.findAll();
			expect(result).toEqual([]);
		});
	});

	describe('findOne', () => {
		it('should return config by id', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity());
			const result = await service.findOne('cfg-1');

			expect(result.id).toBe('cfg-1');
			expect(result.sourceCode).toBe('upwork');
		});

		it('should throw NotFoundException when config does not exist', async () => {
			mockRepo.findOne.mockResolvedValue(null);
			await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
		});
	});

	describe('getConfigForSource', () => {
		it('should find config by sourceCode and sourceOrgId', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity({ sourceOrgId: 'org-123' }));
			const result = await service.getConfigForSource('upwork', 'org-123');

			expect(result).toBeDefined();
			expect(mockRepo.findOne).toHaveBeenCalledWith({
				where: expect.objectContaining({
					sourceCode: 'upwork',
					sourceOrgId: 'org-123',
					isActive: true,
					isArchived: false,
				}),
			});
		});

		it('should fall back to global config when org-specific not found', async () => {
			// First call (org-specific) returns null, second (global) returns config
			mockRepo.findOne
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(makeEntity());

			const result = await service.getConfigForSource('upwork', 'nonexistent-org');

			expect(result).toBeDefined();
			expect(mockRepo.findOne).toHaveBeenCalledTimes(2);
		});

		it('scopes the lookup to the tenant: its own config first, then a tenant-less one, never another tenant', async () => {
			mockRepo.findOne.mockResolvedValue(null);
			await service.getConfigForSource('upwork', 'org-1', 'tenant-1');
			const wheres = mockRepo.findOne.mock.calls.map(([q]) => q.where);
			expect(wheres[0]).toMatchObject({ sourceCode: 'upwork', tenantId: 'tenant-1', sourceOrgId: 'org-1' });
			expect(wheres[1]).toMatchObject({ tenantId: 'tenant-1' });
			expect(wheres[1]).not.toHaveProperty('sourceOrgId'); // any of the tenant's configs, org-bearing included
			expect(wheres[2].tenantId._type).toBe('isNull'); // deployment-wide fallback
			expect(wheres[2]).toMatchObject({ sourceOrgId: 'org-1' });
			expect(wheres[3].tenantId._type).toBe('isNull');
			expect(wheres[3]).not.toHaveProperty('sourceOrgId');
			expect(wheres.every((w) => w.tenantId === 'tenant-1' || w.tenantId?._type === 'isNull')).toBe(true);
		});

		it('without a tenant only deployment-wide (tenant-less) configs are considered', async () => {
			mockRepo.findOne.mockResolvedValue(null);
			await service.getConfigForSource('upwork');
			const wheres = mockRepo.findOne.mock.calls.map(([q]) => q.where);
			expect(wheres).toHaveLength(1);
			expect(wheres[0].tenantId._type).toBe('isNull');
			expect(wheres[0]).not.toHaveProperty('sourceOrgId');
		});

		it('should return null when no config exists at all', async () => {
			mockRepo.findOne.mockResolvedValue(null);
			const result = await service.getConfigForSource('upwork');

			expect(result).toBeNull();
		});
	});

	// ── UPDATE ────────────────────────────────────────────────

	describe('update', () => {
		it('should update auth fields', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity());

			await service.update('cfg-1', {
				auth: {
					accessToken: 'new-token',
				},
			});

			expect(mockRepo.save).toHaveBeenCalledTimes(1);
			const saved = mockRepo.save.mock.calls[0][0];
			expect(saved.accessToken).toBe('new-token');
		});

		it('should update settings without touching auth', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity());

			await service.update('cfg-1', {
				settings: { useProxy: true, resultsWanted: 200 },
			});

			const saved = mockRepo.save.mock.calls[0][0];
			expect(saved.useProxy).toBe(true);
			expect(saved.resultsWanted).toBe(200);
			// Auth remains unchanged
			expect(saved.clientSecret).toBe('super-secret-key');
		});

		it('should throw NotFoundException when updating nonexistent config', async () => {
			mockRepo.findOne.mockResolvedValue(null);
			await expect(service.update('nonexistent', { settings: { useProxy: true } })).rejects.toThrow(NotFoundException);
		});
	});

	// ── DELETE ────────────────────────────────────────────────

	describe('remove', () => {
		it('should remove existing config', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity());
			await service.remove('cfg-1');

			expect(mockRepo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'cfg-1' }));
		});

		it('should throw NotFoundException when removing nonexistent config', async () => {
			mockRepo.findOne.mockResolvedValue(null);
			await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
		});
	});

	// ── SECRET MASKING ───────────────────────────────────────

	describe('toResponse (secret masking)', () => {
		it('should mask clientSecret, accessToken, and refreshToken', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity({
				clientSecret: 'super-secret-key',
				accessToken: 'my-access-token',
				refreshToken: 'my-refresh-token',
			}));

			const result = await service.findOne('cfg-1');

			expect(result.auth.clientSecret).toBe('***-key');
			expect(result.auth.accessToken).toBe('***oken');
			expect(result.auth.refreshToken).toBe('***oken');
		});

		it('should not mask clientId (it is a public identifier)', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity({
				clientId: 'my-public-client-id',
			}));

			const result = await service.findOne('cfg-1');
			expect(result.auth.clientId).toBe('my-public-client-id');
		});

		it('should handle undefined secrets gracefully', async () => {
			mockRepo.findOne.mockResolvedValue(makeEntity({
				clientSecret: undefined,
				accessToken: undefined,
				refreshToken: undefined,
			}));

			const result = await service.findOne('cfg-1');
			expect(result.auth.clientSecret).toBeUndefined();
			expect(result.auth.accessToken).toBeUndefined();
			expect(result.auth.refreshToken).toBeUndefined();
		});
	});
});
