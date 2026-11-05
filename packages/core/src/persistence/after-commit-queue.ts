import { Logger } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';

interface QueuedWork {
	/** Transaction level the work was queued at (1 = the outermost transaction). */
	depth: number;
	run: () => void;
}

interface TransactionState {
	depth: number;
	queued: QueuedWork[];
}

/**
 * Holds work produced by a TypeORM entity subscriber until the transaction that made the change
 * has committed, so a side effect (a notification) never fires for a write that is rolled back.
 *
 * TypeORM calls `afterInsert` / `afterUpdate` inside the transaction (`save()` opens one when none
 * is active), and nested transactions are savepoints on the same QueryRunner. The queue follows
 * the depth of each QueryRunner from the subscriber's transaction events: work queued inside a
 * savepoint moves to the enclosing transaction when the savepoint is released and is dropped when
 * it is rolled back; everything runs once the outermost transaction has committed. Without an
 * active transaction the work runs at once.
 *
 * A subscriber forwards `afterTransactionStart`, `afterTransactionCommit` and
 * `afterTransactionRollback` to `started()`, `committed()` and `rolledBack()`.
 */
export class AfterCommitQueue {
	private readonly logger = new Logger(AfterCommitQueue.name);
	private readonly transactions = new WeakMap<QueryRunner, TransactionState>();

	/** Runs `work` once the transaction of `queryRunner` commits, or now when no transaction is active. */
	enqueue(queryRunner: QueryRunner | undefined, work: () => void): void {
		if (!queryRunner?.isTransactionActive) {
			this.run(work);
			return;
		}
		const state = this.state(queryRunner);
		// a transaction opened before the subscriber was registered counts as the outermost one
		state.queued.push({ depth: Math.max(state.depth, 1), run: work });
	}

	/** A transaction (or a savepoint) was opened on `queryRunner`. */
	started(queryRunner: QueryRunner): void {
		this.state(queryRunner).depth += 1;
	}

	/** A transaction (or a savepoint) was committed on `queryRunner`. */
	committed(queryRunner: QueryRunner): void {
		const state = this.transactions.get(queryRunner);
		if (!state) {
			return;
		}
		state.depth = Math.max(state.depth - 1, 0);
		if (state.depth > 0 && queryRunner.isTransactionActive) {
			// a savepoint was released: its work now belongs to the enclosing transaction
			for (const work of state.queued) {
				work.depth = Math.min(work.depth, state.depth);
			}
			return;
		}
		this.transactions.delete(queryRunner);
		for (const work of state.queued) {
			this.run(work.run);
		}
	}

	/** A transaction (or a savepoint) was rolled back on `queryRunner`: the work queued in it is dropped. */
	rolledBack(queryRunner: QueryRunner): void {
		const state = this.transactions.get(queryRunner);
		if (!state) {
			return;
		}
		const level = Math.max(state.depth, 1);
		state.depth = level - 1;
		state.queued = state.queued.filter((work) => work.depth < level);
		if (state.depth === 0 || !queryRunner.isTransactionActive) {
			this.transactions.delete(queryRunner);
		}
	}

	private state(queryRunner: QueryRunner): TransactionState {
		let state = this.transactions.get(queryRunner);
		if (!state) {
			state = { depth: 0, queued: [] };
			this.transactions.set(queryRunner, state);
		}
		return state;
	}

	/** The work is a side effect of a committed write: a failure is logged, never thrown into TypeORM. */
	private run(work: () => void): void {
		try {
			work();
		} catch (error) {
			this.logger.error(`After-commit work failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
