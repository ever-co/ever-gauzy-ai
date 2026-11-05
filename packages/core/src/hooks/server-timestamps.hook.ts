import { Injectable } from '@nestjs/common';
import { CreateManyInputType, CreateOneInputType, UpdateManyInputType, UpdateOneInputType } from '@ptc-org/nestjs-query-graphql';

/** `createdAt` / `updatedAt` as they may arrive in a mutation input. */
interface Timestamped {
	createdAt?: unknown;
	updatedAt?: unknown;
}

/**
 * The input without `createdAt` / `updatedAt`: the database stamps both. Also used by REST write
 * paths that must not take them from the client (EmployeeService).
 */
export function withoutTimestamps<T>(input: T): T {
	if (!input || typeof input !== 'object') {
		return input;
	}
	const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = input as T & Timestamped;
	return rest as T;
}

/*
 * `createdAt` / `updatedAt` are server-owned: they say when the row was created / last changed in
 * this database, and re-matching (`EmployeeJobPostService.rematch()`) relies on them to tell which
 * stored job posts an employee's changed criteria or profile concern. These hooks drop the two
 * fields from GraphQL create and update inputs, so a client cannot backdate (or post-date) a change.
 */

@Injectable()
export class ServerTimestampsCreateOneHook<T> {
	async run(instance: CreateOneInputType<T>): Promise<CreateOneInputType<T>> {
		if (instance?.input) {
			instance.input = withoutTimestamps(instance.input);
		}
		return instance;
	}
}

@Injectable()
export class ServerTimestampsCreateManyHook<T> {
	async run(instance: CreateManyInputType<T>): Promise<CreateManyInputType<T>> {
		if (Array.isArray(instance?.input)) {
			instance.input = instance.input.map((input) => withoutTimestamps(input));
		}
		return instance;
	}
}

@Injectable()
export class ServerTimestampsUpdateOneHook<T> {
	async run(instance: UpdateOneInputType<T>): Promise<UpdateOneInputType<T>> {
		if (instance?.update) {
			instance.update = withoutTimestamps(instance.update);
		}
		return instance;
	}
}

@Injectable()
export class ServerTimestampsUpdateManyHook<T, U> {
	async run(instance: UpdateManyInputType<T, U>): Promise<UpdateManyInputType<T, U>> {
		if (instance?.update) {
			instance.update = withoutTimestamps(instance.update);
		}
		return instance;
	}
}
