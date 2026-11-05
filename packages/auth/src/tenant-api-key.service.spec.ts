// Mock @packages path aliases before any imports
jest.mock('@packages/core/crud', () => ({
	TenantAwareCrudService: class {
		constructor(protected repo: any) {}
	},
}));

jest.mock('@packages/entities', () => ({
	TenantApiKey: class {},
}));

jest.mock('@dataui/crud-typeorm', () => ({
	TypeOrmCrudService: class {
		constructor(protected repo: any) {}
	},
}));

import { TenantApiKeyService } from './tenant-api-key.service';

// Mock TypeORM repository
const mockRepo = {
	findOne: jest.fn(),
};

describe('TenantApiKeyService', () => {
	let service: TenantApiKeyService;

	const mockApiKey = {
		id: 'key-1',
		apiKey: 'sk-test-123',
		isActive: true,
		isArchived: false,
		tenant: {
			id: 'tenant-1',
			name: 'Test Tenant',
			isActive: true,
			isArchived: false,
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		service = new (TenantApiKeyService as any)(mockRepo);
		(service as any).repo = mockRepo;
	});

	describe('findApiKeyByOptions', () => {
		it('should return the API key when found', async () => {
			mockRepo.findOne.mockResolvedValue(mockApiKey);

			const result = await service.findApiKeyByOptions({ apiKey: 'sk-test-123' } as any);

			expect(result).toEqual(mockApiKey);
			expect(mockRepo.findOne).toHaveBeenCalledWith({
				where: {
					apiKey: 'sk-test-123',
					isActive: true,
					isArchived: false,
					tenant: {
						isActive: true,
						isArchived: false,
					},
				},
				relations: {
					tenant: true,
				},
			});
		});

		it('should return null when API key is not found', async () => {
			mockRepo.findOne.mockResolvedValue(null);

			const result = await service.findApiKeyByOptions({ apiKey: 'nonexistent' } as any);
			expect(result).toBeNull();
		});

		it('should return null on database error', async () => {
			mockRepo.findOne.mockRejectedValue(new Error('DB connection lost'));

			const result = await service.findApiKeyByOptions({ apiKey: 'sk-test-123' } as any);
			expect(result).toBeNull();
		});

		it('should filter by isActive and isArchived on both key and tenant', async () => {
			mockRepo.findOne.mockResolvedValue(null);

			await service.findApiKeyByOptions({ apiKey: 'test' } as any);

			const whereClause = mockRepo.findOne.mock.calls[0][0].where;
			expect(whereClause.isActive).toBe(true);
			expect(whereClause.isArchived).toBe(false);
			expect(whereClause.tenant.isActive).toBe(true);
			expect(whereClause.tenant.isArchived).toBe(false);
		});

		it('should include tenant relation in the query', async () => {
			mockRepo.findOne.mockResolvedValue(mockApiKey);

			await service.findApiKeyByOptions({ apiKey: 'test' } as any);

			expect(mockRepo.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					relations: { tenant: true },
				}),
			);
		});
	});
});
