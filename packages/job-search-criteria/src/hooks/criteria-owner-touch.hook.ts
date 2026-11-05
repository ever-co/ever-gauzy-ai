import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectQueryService, QueryService } from '@ptc-org/nestjs-query-core';
import { DeleteManyInputType, DeleteOneInputType, UpdateManyInputType, UpdateOneInputType } from '@ptc-org/nestjs-query-graphql';
import { GqlContext } from '@packages/core/context/gql-context';
import { Employee, JobSearchCriterion } from '@packages/entities';

/**
 * Re-matching (`EmployeeJobPostService.rematch()`) evaluates stored job posts again for an employee
 * whose matching inputs changed, which it reads from the stored timestamps of the employee and of
 * their criteria. A criterion that is deleted, or moved to another employee, leaves no timestamp
 * behind with its former employee (deleting the last one even widens matching to every post), so
 * these hooks bump that employee's `updatedAt` first (database clock, like the other timestamps).
 * Every query is limited to the caller's tenant.
 *
 * nestjs-query only offers hooks before a mutation, so the bump commits just before the criterion
 * changes; a re-match pass in that window is covered by `rematch()` itself, which also treats a
 * change in the set of an employee's criteria as a new version. The bump is what persists the change
 * across restarts and replicas.
 */
async function touchEmployees(employees: Repository<Employee>, employeeIds: Array<string | undefined>): Promise<void> {
	const ids = Array.from(new Set(employeeIds.filter((id): id is string => Boolean(id))));
	if (ids.length === 0) {
		return;
	}
	await employees.update({ id: In(ids) }, { updatedAt: () => 'CURRENT_TIMESTAMP' });
}

/** The employees owning the criteria a (tenant-scoped) filter selects. */
async function ownersOf(criteria: QueryService<JobSearchCriterion>, filter: DeleteManyInputType<JobSearchCriterion>['filter']): Promise<string[]> {
	const selected = await criteria.query({ filter });
	return selected.map((criterion) => criterion.employeeId);
}

/** The employee owning one criterion of the caller's tenant (nothing for another tenant's id). */
async function ownerOf(criteria: QueryService<JobSearchCriterion>, id: string | number, tenantId: string): Promise<string | undefined> {
	const criterion = await criteria.findById(id, { filter: { tenantId: { eq: tenantId } } });
	return criterion?.employeeId;
}

@Injectable()
export class CriterionDeleteOneTouchesEmployeeHook {
	constructor(
		@InjectRepository(Employee) private readonly employees: Repository<Employee>,
		@InjectQueryService(JobSearchCriterion) private readonly criteria: QueryService<JobSearchCriterion>,
	) {}
	async run(instance: DeleteOneInputType, context: GqlContext) {
		const tenantId = context.req?.tenant?.id;
		if (tenantId && instance?.id !== undefined) {
			await touchEmployees(this.employees, [await ownerOf(this.criteria, instance.id, tenantId)]);
		}
		return instance;
	}
}

/** Runs after DeleteManyByTenantHook, so the filter is limited to the caller's tenant. */
@Injectable()
export class CriteriaDeleteManyTouchEmployeesHook {
	constructor(
		@InjectRepository(Employee) private readonly employees: Repository<Employee>,
		@InjectQueryService(JobSearchCriterion) private readonly criteria: QueryService<JobSearchCriterion>,
	) {}
	async run(instance: DeleteManyInputType<JobSearchCriterion>, context: GqlContext) {
		if (context.req?.tenant?.id && instance?.filter) {
			await touchEmployees(this.employees, await ownersOf(this.criteria, instance.filter));
		}
		return instance;
	}
}

/** Moving a criterion to another employee: the former owner's inputs change too. */
@Injectable()
export class CriterionUpdateOneTouchesFormerOwnerHook {
	constructor(
		@InjectRepository(Employee) private readonly employees: Repository<Employee>,
		@InjectQueryService(JobSearchCriterion) private readonly criteria: QueryService<JobSearchCriterion>,
	) {}
	async run(instance: UpdateOneInputType<{ employeeId?: string }>, context: GqlContext) {
		const tenantId = context.req?.tenant?.id;
		if (tenantId && instance?.id !== undefined && instance.update?.employeeId) {
			const owner = await ownerOf(this.criteria, instance.id, tenantId);
			await touchEmployees(this.employees, [owner === instance.update.employeeId ? undefined : owner]);
		}
		return instance;
	}
}

/** Runs after UpdateManyByTenantHook, so the filter is limited to the caller's tenant. */
@Injectable()
export class CriteriaUpdateManyTouchFormerOwnersHook {
	constructor(
		@InjectRepository(Employee) private readonly employees: Repository<Employee>,
		@InjectQueryService(JobSearchCriterion) private readonly criteria: QueryService<JobSearchCriterion>,
	) {}
	async run(instance: UpdateManyInputType<JobSearchCriterion, { employeeId?: string }>, context: GqlContext) {
		if (context.req?.tenant?.id && instance?.filter && instance.update?.employeeId) {
			const owners = await ownersOf(this.criteria, instance.filter);
			await touchEmployees(this.employees, owners.filter((owner) => owner !== instance.update.employeeId));
		}
		return instance;
	}
}
