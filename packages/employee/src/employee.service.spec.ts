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
// Mock @packages path aliases before any imports
jest.mock('@packages/core/crud', () => ({
	TenantAwareCrudService: class {
		constructor(protected repo: any) {}
	},
}));

jest.mock('@packages/entities', () => ({
	Employee: class {},
}));

jest.mock('@dataui/crud-typeorm', () => ({
	TypeOrmCrudService: class {
		constructor(protected repo: any) {}
	},
}));

import { EmployeeService } from './employee.service';

// Mock TypeORM repository
const mockRepo = {
	find: jest.fn(),
	update: jest.fn(),
	findOneOrFail: jest.fn(),
	findOne: jest.fn().mockResolvedValue({ id: 'emp-1', tenantId: 'tenant-1' }),
};

describe('EmployeeService', () => {
	let service: EmployeeService;

	const mockEmployee = {
		id: 'emp-1',
		tenantId: 'tenant-1',
		firstName: 'John',
		lastName: 'Doe',
		isActive: true,
		isArchived: false,
		bio: null,
		skillsSummary: null,
		preferredRate: null,
		experienceSummary: null,
		jobSearchCriteria: [
			{ id: 'c-1', isActive: true, isArchived: false, category: 'Web Dev' },
		],
	};

	beforeEach(() => {
		jest.clearAllMocks();
		// Construct with mock repo — TenantAwareCrudService extends TypeOrmCrudService
		service = new (EmployeeService as any)(mockRepo);
		(service as any).repo = mockRepo;
	});

	describe('getActiveWithJobSearchCriteria', () => {
		it('should return active employees with job search criteria', async () => {
			mockRepo.find.mockResolvedValue([mockEmployee]);

			const result = await service.getActiveWithJobSearchCriteria();

			expect(result).toEqual([mockEmployee]);
			expect(mockRepo.find).toHaveBeenCalledWith({
				where: { isActive: true, isArchived: false },
				relations: { jobSearchCriteria: true },
			});
		});

		it('should return empty array when no active employees exist', async () => {
			mockRepo.find.mockResolvedValue([]);

			const result = await service.getActiveWithJobSearchCriteria();
			expect(result).toEqual([]);
		});
	});

	describe('updateProfile', () => {
		it('should update only provided fields', async () => {
			const updated = { ...mockEmployee, bio: 'New bio' };
			mockRepo.update.mockResolvedValue({ affected: 1 });
			mockRepo.findOneOrFail.mockResolvedValue(updated);

			const result = await service.updateProfile('emp-1', { bio: 'New bio' });

			expect(mockRepo.update).toHaveBeenCalledWith({ id: 'emp-1', tenantId: 'tenant-1' }, { bio: 'New bio' });
			expect(result).toEqual(updated);
		});

		it('should update multiple fields at once', async () => {
			const input = {
				bio: 'Expert dev',
				skillsSummary: 'React, Node',
				preferredRate: 75,
				experienceSummary: '10 years',
			};
			const updated = { ...mockEmployee, ...input };
			mockRepo.update.mockResolvedValue({ affected: 1 });
			mockRepo.findOneOrFail.mockResolvedValue(updated);

			const result = await service.updateProfile('emp-1', input);

			expect(mockRepo.update).toHaveBeenCalledWith({ id: 'emp-1', tenantId: 'tenant-1' }, input);
			expect(result).toEqual(updated);
		});

		it('should not include undefined fields in update payload', async () => {
			mockRepo.update.mockResolvedValue({ affected: 1 });
			mockRepo.findOneOrFail.mockResolvedValue(mockEmployee);

			await service.updateProfile('emp-1', { bio: 'Only bio' });

			const updateCall = mockRepo.update.mock.calls[0][1];
			expect(updateCall).toEqual({ bio: 'Only bio' });
			expect(updateCall).not.toHaveProperty('skillsSummary');
			expect(updateCall).not.toHaveProperty('preferredRate');
			expect(updateCall).not.toHaveProperty('experienceSummary');
		});

		it('should return the updated entity after save', async () => {
			mockRepo.update.mockResolvedValue({ affected: 1 });
			mockRepo.findOneOrFail.mockResolvedValue({ ...mockEmployee, preferredRate: 100 });

			const result = await service.updateProfile('emp-1', { preferredRate: 100 });
			expect(result.preferredRate).toBe(100);
			expect(mockRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: 'emp-1', tenantId: 'tenant-1' } });
		});
	});
});
