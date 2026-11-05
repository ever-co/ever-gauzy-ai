import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import {
	DataSource,
	EntitySubscriberInterface,
	TransactionCommitEvent,
	TransactionRollbackEvent,
	TransactionStartEvent,
	UpdateEvent,
} from 'typeorm';
import { EmployeeJobApplication } from '@packages/entities';
import { AfterCommitQueue, lockedRow } from '@packages/core/persistence';
import { applicationStatusChange, notifiedApplicationStatus } from './applicationStatus';
import { EmployeeJobApplicationStatusChangedEvent } from './events/employeeJobApplicationStatusChanged.event';

/**
 * Publishes `EmployeeJobApplicationStatusChangedEvent` once, after the write has committed, when
 * an entity save changes `appliedStatus` to a value that stands for a different notification
 * status (see `applicationStatusChange()`): the REST CRUD (`PATCH` / `PUT
 * /api/employee/job/application/:id`) and the GraphQL CRUD (`updateOneEmployeeJobApplication`, and
 * `updateManyEmployeeJobApplications`, whose query service saves row by row when `appliedStatus`
 * is written). Creating an application is not a status change and is not notified.
 *
 * The stored `appliedStatus` is read again under a row lock in `beforeUpdate` (TypeORM loads
 * `databaseEntity` before it opens the save's transaction): of two concurrent saves of the same
 * change, the second one waits and then sees the first one's value, so only one publishes.
 *
 * A query-builder update (`repository.update()`, a bulk UPDATE) reaches a subscriber without the
 * rows or their stored values, so it is ignored here: `EmployeeJobApplicationService.finalize()`
 * uses one and publishes the event itself.
 *
 * Nest creates the subscriber (so it can use the EventBus) and adds it to the DataSource.
 */
@Injectable()
export class EmployeeJobApplicationSubscriber implements EntitySubscriberInterface<EmployeeJobApplication> {
	private readonly afterCommit = new AfterCommitQueue();
	/** Saves that may change the status, with the value stored when their transaction locked the row. */
	private readonly lockedStatus = new WeakMap<object, string | null | undefined>();

	constructor(
		@InjectDataSource() dataSource: DataSource,
		private readonly eventBus: EventBus
	) {
		// one registration per DataSource, even if the provider is instantiated again
		if (!dataSource.subscribers.some((subscriber) => subscriber instanceof EmployeeJobApplicationSubscriber)) {
			dataSource.subscribers.push(this);
		}
	}

	listenTo() {
		return EmployeeJobApplication;
	}

	async beforeUpdate(event: UpdateEvent<EmployeeJobApplication>): Promise<void> {
		const stored = event.databaseEntity;
		const saved = event.entity as Partial<EmployeeJobApplication> | undefined;
		// any raw change to a notified value is read again: `databaseEntity` may be stale, so whether the
		// change is a real one (applicationStatusChange) is decided in afterUpdate from the locked value
		if (!stored || !saved || !notifiedApplicationStatus(saved.appliedStatus) || saved.appliedStatus === stored.appliedStatus) {
			return; // a query-builder update (see the class comment), a save that does not write a notified status, or no change
		}
		this.lockedStatus.set(saved, (await lockedRow(event.manager, EmployeeJobApplication, stored.id, ['appliedStatus']))?.appliedStatus);
	}

	afterUpdate(event: UpdateEvent<EmployeeJobApplication>): void {
		const stored = event.databaseEntity;
		const saved = event.entity as Partial<EmployeeJobApplication> | undefined;
		if (!stored || !saved || !this.lockedStatus.has(saved)) {
			return;
		}
		const previous = this.lockedStatus.get(saved);
		this.lockedStatus.delete(saved);
		const status = applicationStatusChange(previous, saved.appliedStatus);
		if (status) {
			const changed = new EmployeeJobApplicationStatusChangedEvent(stored.id, status, previous);
			this.afterCommit.enqueue(event.queryRunner, () => this.eventBus.publish(changed));
		}
	}

	afterTransactionStart(event: TransactionStartEvent): void {
		this.afterCommit.started(event.queryRunner);
	}

	afterTransactionCommit(event: TransactionCommitEvent): void {
		this.afterCommit.committed(event.queryRunner);
	}

	afterTransactionRollback(event: TransactionRollbackEvent): void {
		this.afterCommit.rolledBack(event.queryRunner);
	}
}
