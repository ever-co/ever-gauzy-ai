import { Logger } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { AfterCommitQueue } from './after-commit-queue';

/** A QueryRunner as far as the queue reads it, driven like TypeORM drives the subscriber events. */
const runner = () => {
	const queryRunner = { isTransactionActive: false, depth: 0 };
	return {
		queryRunner: queryRunner as unknown as QueryRunner,
		start(queue: AfterCommitQueue) {
			queryRunner.isTransactionActive = true;
			queryRunner.depth += 1;
			queue.started(queryRunner as unknown as QueryRunner);
		},
		commit(queue: AfterCommitQueue) {
			queryRunner.depth -= 1;
			queryRunner.isTransactionActive = queryRunner.depth > 0;
			queue.committed(queryRunner as unknown as QueryRunner);
		},
		rollback(queue: AfterCommitQueue) {
			queryRunner.depth -= 1;
			queryRunner.isTransactionActive = queryRunner.depth > 0;
			queue.rolledBack(queryRunner as unknown as QueryRunner);
		},
	};
};

describe('AfterCommitQueue', () => {
	it('runs the work at once when no transaction is active', () => {
		const queue = new AfterCommitQueue();
		const work = jest.fn();
		queue.enqueue(undefined, work);
		queue.enqueue(runner().queryRunner, work);
		expect(work).toHaveBeenCalledTimes(2);
	});

	it('runs the work once, after the transaction commits', () => {
		const queue = new AfterCommitQueue();
		const tx = runner();
		const work = jest.fn();
		tx.start(queue);
		queue.enqueue(tx.queryRunner, work);
		expect(work).not.toHaveBeenCalled();
		tx.commit(queue);
		expect(work).toHaveBeenCalledTimes(1);
		// a later transaction on the same runner does not run it again
		tx.start(queue);
		tx.commit(queue);
		expect(work).toHaveBeenCalledTimes(1);
	});

	it('drops the work of a rolled-back transaction', () => {
		const queue = new AfterCommitQueue();
		const tx = runner();
		const work = jest.fn();
		tx.start(queue);
		queue.enqueue(tx.queryRunner, work);
		tx.rollback(queue);
		tx.start(queue);
		tx.commit(queue);
		expect(work).not.toHaveBeenCalled();
	});

	it('keeps the work of a released savepoint until the outer commit and drops the work of a rolled-back one', () => {
		const queue = new AfterCommitQueue();
		const tx = runner();
		const outer = jest.fn();
		const released = jest.fn();
		const rolledBack = jest.fn();
		tx.start(queue);
		queue.enqueue(tx.queryRunner, outer);
		tx.start(queue); // savepoint 1
		queue.enqueue(tx.queryRunner, released);
		tx.commit(queue); // released
		tx.start(queue); // savepoint 2
		queue.enqueue(tx.queryRunner, rolledBack);
		tx.rollback(queue);
		expect(outer).not.toHaveBeenCalled();
		expect(released).not.toHaveBeenCalled();
		tx.commit(queue);
		expect(outer).toHaveBeenCalledTimes(1);
		expect(released).toHaveBeenCalledTimes(1);
		expect(rolledBack).not.toHaveBeenCalled();
	});

	it('never throws a failing work item into TypeORM and still runs the others', () => {
		const queue = new AfterCommitQueue();
		const tx = runner();
		const after = jest.fn();
		const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		tx.start(queue);
		queue.enqueue(tx.queryRunner, () => {
			throw new Error('boom');
		});
		queue.enqueue(tx.queryRunner, after);
		expect(() => tx.commit(queue)).not.toThrow();
		expect(after).toHaveBeenCalledTimes(1);
		expect(logged).toHaveBeenCalledWith('After-commit work failed: boom');
		logged.mockRestore();
	});
});
