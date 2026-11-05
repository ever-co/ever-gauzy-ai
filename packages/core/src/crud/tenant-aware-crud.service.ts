import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeepPartial, FindManyOptions, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
import { CreateManyDto, CrudRequest, GetManyDefaultResponse } from '@dataui/crud';
import { QueryFilter } from '@dataui/crud-request';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { TenantBaseEntity } from '../entities/tenant-base.entity';
import { RequestContext } from '../context';
import { toFindRelations } from './find-relations';

export abstract class TenantAwareCrudService<T extends TenantBaseEntity> extends TypeOrmCrudService<T> {

	constructor(
		protected readonly repository: Repository<T>
	) {
		super(repository);
	}

	/**
	 * Generates conditions for the `tenant` and `tenantId` fields based on the provided tenantId.
	 *
	 * @param tenantId - The ID of the tenant for which conditions are generated.
	 * @returns {FindOptionsWhere<T>} Conditions for the `tenant` and `tenantId` fields.
	 */
	private findConditionsByUserTenant(tenantId: string): FindOptionsWhere<T> {
		return {
			...(this.repository.metadata.hasColumnWithPropertyPath('tenantId')
				? {
					tenant: {
						id: tenantId,
					},
					tenantId: tenantId,
				}
				: {}),
		} as FindOptionsWhere<T>;
	}

	/**
	 * Combines the provided conditions with conditions for the `tenant` and `tenantId` fields based on the given tenantId.
	 *
	 * @param tenantId - The ID of the tenant for which conditions are generated.
	 * @param where - Optional conditions to be combined with tenant conditions.
	 * @returns {FindOptionsWhere<T>[] | FindOptionsWhere<T>} Combined conditions for the `tenant` and `tenantId` fields.
	 */
	private findConditionsWithTenant(
		tenantId: string,
		where?: FindOptionsWhere<T>[] | FindOptionsWhere<T>
	): FindOptionsWhere<T>[] | FindOptionsWhere<T> {
		if (where && Array.isArray(where)) {
			const wheres: FindOptionsWhere<T>[] = where.map((options: FindOptionsWhere<T>) => ({
				...options,
				...this.findConditionsByUserTenant(tenantId),
			}));
			return wheres;
		}

		return (
			where ? {
				...where,
				...this.findConditionsByUserTenant(tenantId)
			} : {
				...this.findConditionsByUserTenant(tenantId)
			}
		) as FindOptionsWhere<T>;
	}

	/**
	 * Builds a `FindOneOptions<T>` object with tenant conditions based on the provided filter.
	 *
	 * @param filter - Optional filter conditions for the query.
	 * @returns {FindOneOptions<T>} The final filter object with tenant conditions.
	 */
	private findOneWithTenant(filter?: FindOneOptions<T>): FindOneOptions<T> {
		const tenantId = RequestContext.currentTenantId();
		if (!tenantId) {
			return filter || {};
		}

		return {
			...(filter || {}),
			where: this.findConditionsWithTenant(tenantId, filter?.where),
		};
	}

	/**
	 * Builds a `FindManyOptions<T>` object with tenant conditions based on the provided filter.
	 *
	 * @param filter - Optional filter conditions for the query.
	 * @returns {FindManyOptions<T>} The final filter object with tenant conditions.
	 */
	private findManyWithTenant(filter?: FindManyOptions<T>): FindManyOptions<T> {
		const tenantId = RequestContext.currentTenantId();
		if (!tenantId) {
			return filter || {};
		}

		return {
			...(filter || {}),
			where: this.findConditionsWithTenant(tenantId, filter?.where),
		};
	}

	/**
	 * Finds entities that match given find options.
	 * Also counts all entities that match given conditions,
	 * but ignores pagination settings (from and take options).
	 *
	 * @param filter
	 * @returns
	 */
	public async findAll(filter?: FindManyOptions<T>): Promise<T[]> {
		// Perform the retrieval operation using the parent class's `find` method
		// applying additional logic specified in `findManyWithTenant`
		return await super.find(
			this.findManyWithTenant(filter)
		);
	}

	/**
	 * Retrieves multiple records based on the provided CRUD request, applying specified filters and returning the result.
	 *
	 * @param req - The CRUD request containing specifications for the retrieval.
	 * @returns A Promise resolving to either a `GetManyDefaultResponse<T>` or an array of entities of type `T`.
	 * The response format may include additional metadata for paginated results.
	 */
	async getMany(req: CrudRequest<{}, {}>): Promise<T[] | GetManyDefaultResponse<T>> {
		// Build filter options for the query based on the CRUD request
		const filter: FindManyOptions<T> = this.buildFindManyOptions(req);

		// Perform the retrieval operation using the parent class's `find` method
		// applying additional logic specified in `findManyWithTenant`
		return await super.find(
			this.findManyWithTenant(filter)
		);
	}

	/**
	 * Retrieves a single record based on the provided CRUD request, applying specified filters and returning the result.
	 * 
	 * @param req - The CRUD request containing specifications for the retrieval.
	 * @returns A Promise resolving to the retrieved entity.
	 * @throws BadRequestException if 'id' filter is not present.
	 */
	async getOne(req: CrudRequest<{}, {}>): Promise<T> {
		// Build filter options for finding one record using the provided helper method
		const filter: FindOneOptions<T> = this.buildFindOneOptions(req);

		// Retrieve the entity using the ID and the options for finding one
		return await this.findOneByIdString(
			this.parseIdFilter(req),
			this.findOneWithTenant(filter)
		);
	}

	/**
	 * Creates a single record based on the provided CRUD request and DTO, applying specified modifications.
	 * 
	 * @param req - The CRUD request.
	 * @param dto - The DTO (Data Transfer Object) containing the data for creating the record.
	 * @returns A Promise resolving to the created entity.
	 */
	async createOne(req: CrudRequest<{}, {}>, dto: DeepPartial<T>): Promise<T> {
		// Retrieve the current tenant ID from the RequestContext
		const tenantId = RequestContext.currentTenantId();

		// Build the data for creating the record, including the tenant information if applicable
		const recordDto: DeepPartial<T> = {
			...dto,
			...(this.repository.metadata.hasColumnWithPropertyPath('tenantId') ? {
				tenant: {
					id: tenantId
				},
				tenantId,
			} : {}),
		};

		// Call the parent class's method to create the record
		return await super.createOne(req, recordDto);
	}

	/**
	 * Creates multiple records based on the provided CRUD request and DTO, applying specified modifications.
	 * 
	 * @param req - The CRUD request.
	 * @param dto - The DTO (Data Transfer Object) containing the data for creating multiple records.
	 * @returns A Promise resolving to an array of created entities.
	 */
	async createMany(req: CrudRequest<{}, {}>, dto: CreateManyDto<DeepPartial<T>>): Promise<T[]> {
		// Retrieve the current tenant ID from the RequestContext
		const tenantId = RequestContext.currentTenantId();

		// Modify each item in the bulk array to include tenant information if applicable
		dto.bulk = dto.bulk.map((item: DeepPartial<T>) => ({
			...item,
			...(this.repository.metadata.hasColumnWithPropertyPath('tenantId') ? {
				tenant: {
					id: tenantId
				},
				tenantId,
			} : {}),
		}));

		// Call the parent class's method to create multiple records
		return await super.createMany(req, dto);
	}

	/**
	 * 
	 * @param req 
	 * @param dto 
	 */
	async replaceOne(req: CrudRequest<{}, {}>, dto: DeepPartial<T>): Promise<T> {
		try {
			// Retrieve the entity using the ID and the options for finding one
			await this.getOne(req);

			// Retrieve the current tenant ID from the RequestContext
			const tenantId = RequestContext.currentTenantId();

			// Build the data for updating the record, including the tenant information if applicable
			const replaceDto: DeepPartial<T> = {
				...dto,
				...(this.repository.metadata.hasColumnWithPropertyPath('tenantId') ? {
					tenant: {
						id: tenantId
					},
					tenantId,
				} : {}),
			};

			// Call the parent class's method to update the record
			const replacedEntity = await super.replaceOne(req, replaceDto);
			return replacedEntity;
		} catch (error) {
			throw new BadRequestException(error.message);
		}
	}

	/**
	 * Updates a single record based on the provided CRUD request and DTO, applying specified modifications.
	 * 
	 * @param req - The CRUD request.
	 * @param dto - The DTO (Data Transfer Object) containing the data for updating the record.
	 * @returns A Promise resolving to the updated entity.
	 * @throws BadRequestException if the entity with the specified 'id' is not found.
	 */
	async updateOne(req: CrudRequest<{}, {}>, dto: DeepPartial<T>): Promise<T> {
		try {
			// Retrieve the entity using the ID and the options for finding one
			await this.getOne(req);

			// Retrieve the current tenant ID from the RequestContext
			const tenantId = RequestContext.currentTenantId();

			// Build the data for updating the record, including the tenant information if applicable
			const updateDto: DeepPartial<T> = {
				...dto,
				...(this.repository.metadata.hasColumnWithPropertyPath('tenantId') ? {
					tenant: {
						id: tenantId
					},
					tenantId,
				} : {}),
			};

			// Call the parent class's method to update the record
			const updatedEntity = await super.updateOne(req, updateDto);
			return updatedEntity;
		} catch (error) {
			throw new BadRequestException(error.message);
		}
	}

	/**
	 * Deletes a single record based on the provided CRUD request.
	 * 
	 * @param req - The CRUD request.
	 * @returns A Promise resolving to the deleted entity, or void if the entity is not found.
	 * @throws BadRequestException if the entity with the specified 'id' is not found.
	 */
	async deleteOne(req: CrudRequest<{}, {}>): Promise<void | T> {
		try {
			// Retrieve the entity using the specified 'id'
			await this.getOne(req);

			// Call the parent class's method to delete the record
			const deletedRecord = await super.deleteOne(req);

			return deletedRecord;
		} catch (error) {
			// Throw a BadRequestException with the error message if the entity is not found
			throw new BadRequestException(error.message);
		}
	}


	/**
	 * Finds a single record by its ID using the specified options.
	 *
	 * @param id - The ID of the record to find.
	 * @param options - Optional FindOneOptions<T> to customize the query.
	 * @returns {Promise<T>} A promise that resolves to the found record.
	 * @throws {NotFoundException} Thrown if the requested record is not found.
	 */
	public async findOneByIdString(
		id: T['id'],
		options?: FindOneOptions<T>
	): Promise<T> {
		const relations = toFindRelations<T>(options?.relations);
		const record = await super.findOne({
			where: {
				id,
				...(options?.where || {}),
			},
			...(relations ? { relations } : {}),
		} as FindOneOptions<T>);

		if (!record) {
			throw new NotFoundException(`The requested record was not found`);
		}

		return record;
	}

	/**
	 * Builds and returns options for querying multiple records based on the provided CRUD request.
	 * 
	 * @param req - The CRUD request containing specifications for the query.
	 * @returns A `FindManyOptions<T>` object representing the options for the query.
	 */
	private buildFindManyOptions(req: CrudRequest<{}, {}>): FindManyOptions<T> {
		// Initialize an empty options object
		const findManyOptions: FindManyOptions<T> = new Object();

		// Check if the request specifies a limit for the number of records to retrieve
		if (req.parsed.limit) {
			findManyOptions.take = req.parsed.limit;
		}

		// Check if the request specifies an offset for skipping records before retrieval
		if (req.parsed.offset) {
			findManyOptions.skip = req.parsed.offset;
		}

		// Build additional options for finding one record using the provided helper function
		const findOneOptions: FindOneOptions<T> = this.buildFindOneOptions(req);

		// Merge the options for finding many and finding one
		return {
			...findManyOptions,
			...findOneOptions,
		};
	}

	/**
	 * Builds and returns options for querying a single record based on the provided CRUD request.
	 * 
	 * @param req - The CRUD request containing specifications for the query.
	 * @returns A `FindOneOptions<T>` object representing the options for the query.
	 */
	private buildFindOneOptions(req: CrudRequest<{}, {}>): FindOneOptions<T> {
		// Initialize an empty options object
		const options: FindOneOptions<T> = new Object();

		// Check if the request's parsed data has extra information
		if (req.parsed.extra) {
			// If extra information includes relations, assign them to options (object form: TypeORM 1.x)
			const relations = toFindRelations<T>(req.parsed.extra['relations']);
			if (relations) options.relations = relations;
		}

		// Return the populated options object
		return options;
	}

	/**
	 * Parses the 'id' filter from the CrudRequest.
	 * 
	 * @param req - The CRUD request.
	 * @returns The 'id' value if found.
	 * @throws BadRequestException if 'id' filter is not present.
	 */
	private parseIdFilter(req: CrudRequest<{}, {}>): string {
		// Find the 'id' filter in the parsed parameters
		const idFilter = req.parsed.paramsFilter.find((filter: QueryFilter) => filter.field === 'id');

		// If 'id' filter is found, return its value
		if (idFilter) {
			return idFilter.value;
		}

		// Throw a BadRequestException if 'id' filter is not present
		throw new BadRequestException('Missing or invalid "id" parameter');
	}
}
