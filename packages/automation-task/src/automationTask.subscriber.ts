import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import {
	DataSource,
	EntitySubscriberInterface,
	InsertEvent,
	QueryRunner,
	TransactionCommitEvent,
	TransactionRollbackEvent,
	TransactionStartEvent,
	UpdateEvent,
} from 'typeorm';
import { AutomationTask } from '@packages/entities';
import { AfterCommitQueue, lockedRow } from '@packages/core/persistence';
import { AutomationTaskFinishedEvent } from './events/automationTaskFinished.event';
import { AutomationTaskOutcome, failureMessageOf, terminalTaskStatus } from './automationTask.status';

/**
 * Detects the moment a task finishes and publishes `AutomationTaskFinishedEvent` once, after the
 * write has committed.
 *
 * Covers every write that saves the entity: the REST CRUD (`PATCH` / `PUT /api/automation/task/:id`,
 * and a task created already finished), the GraphQL CRUD (`updateOneAutomationTask`, the create
 * mutations, and `updateManyAutomationTasks`, whose query service saves row by row when `status`
 * is written) and `AutomationTaskCreateCommand`. A save is a transition when the new `status` is
 * terminal and differs from the stored one: a non-terminal change, a save that repeats the stored
 * status and a save that does not write `status` publish nothing.
 *
 * The stored status (and result) is read again under a row lock in `beforeUpdate` (TypeORM loads
 * `databaseEntity` before it opens the save's transaction): of two concurrent saves of the same
 * transition, the second one waits and then sees the first one's status, so only one publishes;
 * the error of a `failed` transition is the result this save wrote, or else the one stored.
 *
 * A query-builder update (`repository.update()`, a bulk UPDATE) reaches a subscriber without the
 * rows or their stored values, so it is ignored here: a writer that uses one publishes the event
 * itself for the rows it changed (`OpsService.cleanupStaleTasks()`).
 *
 * Nest creates the subscriber (so it can use the EventBus) and adds it to the DataSource.
 */
@Injectable()
export class AutomationTaskSubscriber implements EntitySubscriberInterface<AutomationTask> {
	private readonly afterCommit = new AfterCommitQueue();
	/** Saves that may be a transition, with the status and result stored when their transaction locked the row. */
	private readonly lockedState = new WeakMap<object, Pick<AutomationTask, 'status' | 'commandResult'> | undefined>();

	constructor(
		@InjectDataSource() dataSource: DataSource,
		private readonly eventBus: EventBus
	) {
		// one registration per DataSource, even if the provider is instantiated again
		if (!dataSource.subscribers.some((subscriber) => subscriber instanceof AutomationTaskSubscriber)) {
			dataSource.subscribers.push(this);
		}
	}

	listenTo() {
		return AutomationTask;
	}

	afterInsert(event: InsertEvent<AutomationTask>): void {
		const task = event.entity;
		const status = terminalTaskStatus(task?.status);
		if (status && task.id) {
			this.publishAfterCommit(event.queryRunner, this.finished(task.id, status, undefined, task.commandResult));
		}
	}

	async beforeUpdate(event: UpdateEvent<AutomationTask>): Promise<void> {
		const stored = event.databaseEntity;
		const saved = event.entity as Partial<AutomationTask> | undefined;
		if (!stored || !saved || !terminalTaskStatus(saved.status) || saved.status === stored.status) {
			return; // a query-builder update (see the class comment), or not a transition
		}
		this.lockedState.set(saved, await lockedRow(event.manager, AutomationTask, stored.id, ['status', 'commandResult']));
	}

	afterUpdate(event: UpdateEvent<AutomationTask>): void {
		const stored = event.databaseEntity;
		const saved = event.entity as Partial<AutomationTask> | undefined;
		if (!stored || !saved || !this.lockedState.has(saved)) {
			return;
		}
		const locked = this.lockedState.get(saved);
		this.lockedState.delete(saved);
		const status = terminalTaskStatus(saved.status);
		if (status && saved.status !== locked?.status) {
			// the result this save wrote; a full entity also carries unchanged (unwritten) values, which may be stale
			const wroteResult = event.updatedColumns.some((column) => column.propertyName === 'commandResult');
			const commandResult = wroteResult ? saved.commandResult : locked?.commandResult;
			this.publishAfterCommit(event.queryRunner, this.finished(stored.id, status, locked?.status, commandResult));
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

	/** The event with what the notification needs from this write (the error is taken now, not when it is sent). */
	private finished(
		taskId: string,
		status: AutomationTaskOutcome,
		previousStatus: string | undefined,
		commandResult: string | null | undefined
	): AutomationTaskFinishedEvent {
		return new AutomationTaskFinishedEvent(taskId, status, previousStatus, status === 'failed' ? failureMessageOf(commandResult) : undefined);
	}

	private publishAfterCommit(queryRunner: QueryRunner | undefined, finished: AutomationTaskFinishedEvent): void {
		this.afterCommit.enqueue(queryRunner, () => this.eventBus.publish(finished));
	}
}
