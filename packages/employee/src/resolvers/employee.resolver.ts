import { UseInterceptors } from '@nestjs/common';
import { Resolver, Mutation, Args, ID } from "@nestjs/graphql";
import { QueryService, InjectQueryService } from '@ptc-org/nestjs-query-core';
import { AuthorizerInterceptor, CRUDResolver, InjectPubSub } from "@ptc-org/nestjs-query-graphql";
import { PubSub } from 'graphql-subscriptions';
import { EmployeeDTO } from "@packages/dto";
import { Employee } from "@packages/entities";
import { EmployeeService } from '../employee.service';
import { UpdateEmployeeProfileInput } from '../dto/updateEmployeeProfile.input';

@Resolver(() => EmployeeDTO)
@UseInterceptors(AuthorizerInterceptor(EmployeeDTO))
export class EmployeeResolver extends CRUDResolver(EmployeeDTO, {
	delete: { disabled: true },
	enableAggregate: true,
	enableTotalCount: true
}) {
	constructor(
		@InjectQueryService(Employee) readonly service: QueryService<Employee>,
		@InjectPubSub() readonly pubSub: PubSub,
		private readonly employeeService: EmployeeService,
	) {
		super(service);
	}

	/**
	 * Update employee profile enrichment fields (bio, skillsSummary, preferredRate, experienceSummary).
	 */
	@Mutation(() => EmployeeDTO, {
		name: 'updateEmployeeProfile',
		description: 'Update employee enrichment fields (bio, skills, rate, experience)',
	})
	async updateEmployeeProfile(
		@Args('id', { type: () => ID }) id: string,
		@Args('input') input: UpdateEmployeeProfileInput,
	): Promise<Employee> {
		return this.employeeService.updateProfile(id, input);
	}
}
