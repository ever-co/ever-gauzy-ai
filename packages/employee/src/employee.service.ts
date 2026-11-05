import { NotFoundException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, Repository } from 'typeorm';
import { CreateManyDto, CrudRequest } from '@dataui/crud';
import { TenantAwareCrudService } from '@packages/core/crud';
import { withoutTimestamps } from '@packages/core/hooks/server-timestamps.hook';
import { Employee } from '@packages/entities';

// Service responsible to register (and decommission) employees in the Gauzy AI system
import { currentTenantWhere } from '@packages/core/context';

@Injectable()
export class EmployeeService extends TenantAwareCrudService<Employee> {
	constructor(
		@InjectRepository(Employee)
		protected readonly repo: Repository<Employee>
	) {
		super(repo);
	}

	/*
	 * REST writes (`/api/employee`): `createdAt` / `updatedAt` are stamped by the database, never taken
	 * from the client — re-matching relies on them (EmployeeJobPostService.rematch()); the GraphQL
	 * mutations drop them with ServerTimestamps*Hook.
	 */

	async createOne(req: CrudRequest<{}, {}>, dto: DeepPartial<Employee>): Promise<Employee> {
		return super.createOne(req, withoutTimestamps(dto));
	}

	async createMany(req: CrudRequest<{}, {}>, dto: CreateManyDto<DeepPartial<Employee>>): Promise<Employee[]> {
		return super.createMany(req, { ...dto, bulk: (dto?.bulk ?? []).map((item) => withoutTimestamps(item)) });
	}

	async replaceOne(req: CrudRequest<{}, {}>, dto: DeepPartial<Employee>): Promise<Employee> {
		return super.replaceOne(req, withoutTimestamps(dto));
	}

	async updateOne(req: CrudRequest<{}, {}>, dto: DeepPartial<Employee>): Promise<Employee> {
		return super.updateOne(req, withoutTimestamps(dto));
	}

	/**
	 * Retrieves a list of active employees with their job search criteria.
	 * 
	 * @returns A Promise resolving to an array of Employee entities.
	 */
	public async getActiveWithJobSearchCriteria(): Promise<Employee[]> {
		// Initialize an empty options object
		const findManyOptions: FindOneOptions<Employee> = {
			where: {
				isActive: true,
				isArchived: false,
			},
			relations: {
				jobSearchCriteria: true,
			},
		};
		/**
		 * Question: Do we need to apply tenant filter here? If we need to use below query filter
		 * 
		 * return await super.findAll(findManyOptions);
		 */
		return await this.repo.find(findManyOptions);
	}

	/**
	 * Update employee profile enrichment fields.
	 *
	 * @param id - Employee ID
	 * @param input - Partial enrichment fields to update
	 * @returns Updated Employee entity
	 */
	public async updateProfile(
		id: string,
		input: {
			bio?: string;
			skillsSummary?: string;
			preferredRate?: number;
			experienceSummary?: string;
		}
	): Promise<Employee> {
		// Build update payload with only provided fields
		const updatePayload: Partial<Employee> = {};
		if (input.bio !== undefined) updatePayload.bio = input.bio;
		if (input.skillsSummary !== undefined) updatePayload.skillsSummary = input.skillsSummary;
		if (input.preferredRate !== undefined) updatePayload.preferredRate = input.preferredRate;
		if (input.experienceSummary !== undefined) updatePayload.experienceSummary = input.experienceSummary;

		const where = { id, ...currentTenantWhere() } as any;
		if (!(await this.repo.findOne({ where }))) {
			throw new NotFoundException(`Employee ${id} not found`);
		}
		await this.repo.update(where, updatePayload);
		return this.repo.findOneOrFail({ where });
	}
}
