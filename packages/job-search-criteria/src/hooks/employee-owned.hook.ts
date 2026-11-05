import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	CreateManyInputType,
	CreateOneInputType,
	UpdateManyInputType,
	UpdateOneInputType,
} from '@ptc-org/nestjs-query-graphql';
import { GqlContext } from '@packages/core/context/gql-context';
import { Employee } from '@packages/entities';

/**
 * A criterion may only point at an employee of the caller's tenant. The tenant hooks stamp
 * `tenantId` on the criterion itself, but without this check a caller could attach criteria to
 * another tenant's employee and steer that tenant's crawling and matching.
 */
async function assertEmployeeOwned(repo: Repository<Employee>, context: GqlContext, employeeId?: string): Promise<void> {
	if (employeeId === undefined || employeeId === null) {
		return;
	}
	const tenantId = context.req?.tenant?.id;
	if (!tenantId) {
		throw new UnauthorizedException('A tenant is required for this operation');
	}
	const owned = await repo.exists({ where: { id: employeeId, tenantId } as any });
	if (!owned) {
		throw new ForbiddenException(`Employee ${employeeId} does not belong to this tenant`);
	}
}

@Injectable()
export class EmployeeOwnedCreateOneHook {
	constructor(@InjectRepository(Employee) private readonly employees: Repository<Employee>) {}
	async run(instance: CreateOneInputType<{ employeeId?: string }>, context: GqlContext) {
		await assertEmployeeOwned(this.employees, context, instance.input?.employeeId);
		return instance;
	}
}

@Injectable()
export class EmployeeOwnedCreateManyHook {
	constructor(@InjectRepository(Employee) private readonly employees: Repository<Employee>) {}
	async run(instance: CreateManyInputType<{ employeeId?: string }>, context: GqlContext) {
		// one check per distinct employee: a bulk create usually targets a single employee many times
		const employeeIds = new Set((instance.input ?? []).map((item) => item?.employeeId));
		for (const employeeId of employeeIds) {
			await assertEmployeeOwned(this.employees, context, employeeId);
		}
		return instance;
	}
}

@Injectable()
export class EmployeeOwnedUpdateOneHook {
	constructor(@InjectRepository(Employee) private readonly employees: Repository<Employee>) {}
	async run(instance: UpdateOneInputType<{ employeeId?: string }>, context: GqlContext) {
		await assertEmployeeOwned(this.employees, context, instance.update?.employeeId);
		return instance;
	}
}

@Injectable()
export class EmployeeOwnedUpdateManyHook {
	constructor(@InjectRepository(Employee) private readonly employees: Repository<Employee>) {}
	async run(instance: UpdateManyInputType<{ employeeId?: string }, { employeeId?: string }>, context: GqlContext) {
		await assertEmployeeOwned(this.employees, context, instance.update?.employeeId);
		return instance;
	}
}
