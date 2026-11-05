import { SourceConfigResolver } from './sourceConfig.resolver';
import type { SourceConfigService } from './sourceConfig.service';

describe('SourceConfigResolver', () => {
	let resolver: SourceConfigResolver;
	let mockService: jest.Mocked<Pick<SourceConfigService, 'create' | 'findAll' | 'findOne' | 'update' | 'remove'>>;

	const mockResponse = {
		id: 'cfg-1',
		sourceCode: 'upwork',
		tenantId: 'tenant-1',
		orgId: 'org-1',
		sourceOrgId: null,
		auth: {
			grantType: 'client_credentials',
			clientId: 'upwork-client-id',
			clientSecret: '***-key',
			accessToken: undefined,
			refreshToken: undefined,
		},
		settings: {
			useProxy: false,
			cacheTtlSeconds: null,
			resultsWanted: 50,
		},
		isActive: true,
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
	};

	beforeEach(() => {
		mockService = {
			create: jest.fn().mockResolvedValue(mockResponse),
			findAll: jest.fn().mockResolvedValue([mockResponse]),
			findOne: jest.fn().mockResolvedValue(mockResponse),
			update: jest.fn().mockResolvedValue(mockResponse),
			remove: jest.fn().mockResolvedValue(undefined),
		};
		resolver = new SourceConfigResolver(mockService as any);
	});

	describe('createSourceConfig', () => {
		it('should delegate to service.create', async () => {
			const input = { sourceCode: 'upwork', tenantId: 'tenant-1' };
			const result = await resolver.createSourceConfig(input as any);

			expect(mockService.create).toHaveBeenCalledWith(input);
			expect(result.sourceCode).toBe('upwork');
		});
	});

	describe('sourceConfigs', () => {
		it('should delegate to service.findAll with filters', async () => {
			const result = await resolver.sourceConfigs('upwork', 'tenant-1', 'org-1');

			expect(mockService.findAll).toHaveBeenCalledWith('upwork', 'tenant-1', 'org-1');
			expect(result).toHaveLength(1);
		});

		it('should pass undefined for omitted filters', async () => {
			await resolver.sourceConfigs();

			expect(mockService.findAll).toHaveBeenCalledWith(undefined, undefined, undefined);
		});
	});

	describe('sourceConfig', () => {
		it('should delegate to service.findOne', async () => {
			const result = await resolver.sourceConfig('cfg-1');

			expect(mockService.findOne).toHaveBeenCalledWith('cfg-1');
			expect(result.id).toBe('cfg-1');
		});
	});

	describe('updateSourceConfig', () => {
		it('should delegate to service.update', async () => {
			const input = { settings: { useProxy: true } };
			const result = await resolver.updateSourceConfig('cfg-1', input as any);

			expect(mockService.update).toHaveBeenCalledWith('cfg-1', input);
			expect(result).toBeDefined();
		});
	});

	describe('removeSourceConfig', () => {
		it('should delegate to service.remove and return true', async () => {
			const result = await resolver.removeSourceConfig('cfg-1');

			expect(mockService.remove).toHaveBeenCalledWith('cfg-1');
			expect(result).toBe(true);
		});
	});
});
