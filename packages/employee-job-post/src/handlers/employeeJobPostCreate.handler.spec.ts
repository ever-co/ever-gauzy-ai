import { EmployeeJobPost } from '@packages/entities';
import { EmployeeJobPostCreateCommandHandler } from './employeeJobPostCreate.handler';
import { EmployeeJobPostCreateCommand } from '../commands/employeeJobPostCreate.command';
import { EmployeeJobPostCreatedEvent } from '../events/employeeJobPostCreated.event';

const STORED_AT = new Date('2026-11-01T12:00:00Z');

/**
 * A fake `employee_job_post` table with the unique index on (employeeId, jobPostId): an insert with
 * ON CONFLICT DO NOTHING skips the rows whose pair is stored already.
 */
const fakeTable = (alreadyStored: Array<[string, string]>) => {
	const pairs = new Set(alreadyStored.map(([employeeId, jobPostId]) => `${employeeId}|${jobPostId}`));
	const ids = new Set<string>();
	const qb: any = {
		insert: () => qb,
		into: () => qb,
		values: jest.fn((rows: EmployeeJobPost[]) => {
			qb.pending = rows;
			return qb;
		}),
		orIgnore: jest.fn(() => qb),
		updateEntity: jest.fn(() => qb),
		execute: jest.fn(async () => {
			for (const row of qb.pending as EmployeeJobPost[]) {
				const pair = `${row.employeeId}|${row.jobPostId}`;
				if (!pairs.has(pair)) {
					pairs.add(pair);
					ids.add(row.id);
				}
			}
		}),
	};
	// the transaction's entity manager
	const manager = {
		createQueryBuilder: jest.fn(() => qb),
		find: jest.fn(async (_entity: unknown, { where }: any) =>
			(where.id.value as string[]).filter((id) => ids.has(id)).map((id) => ({ id, createdAt: STORED_AT, updatedAt: STORED_AT, scoringAttempts: 0 })),
		),
	};
	return {
		qb,
		manager,
		repo: {
			manager: { transaction: jest.fn(async (work: (m: typeof manager) => Promise<unknown>) => work(manager)) },
		},
	};
};

const match = (employeeId: string, jobPostId: string, extra: Partial<EmployeeJobPost> = {}) =>
	Object.assign(new EmployeeJobPost(), { employeeId, jobPostId, providerCode: 'linkedin', ...extra });

describe('EmployeeJobPostCreateCommandHandler', () => {
	let eventBus: { publish: jest.Mock };

	beforeEach(() => {
		eventBus = { publish: jest.fn() };
	});

	it('stores new matches with ON CONFLICT DO NOTHING and announces them', async () => {
		const { repo, qb } = fakeTable([]);
		const handler = new EmployeeJobPostCreateCommandHandler(repo as any, eventBus as any);

		const created = await handler.execute(new EmployeeJobPostCreateCommand([match('emp-1', 'job-1'), match('emp-1', 'job-2')]));

		expect(qb.orIgnore).toHaveBeenCalled();
		// RETURNING rows must not be merged by position (a skipped row would shift them)
		expect(qb.updateEntity).toHaveBeenCalledWith(false);
		expect(created.map((m) => m.jobPostId)).toEqual(['job-1', 'job-2']);
		expect(created.every((m) => typeof m.id === 'string' && m.id.length > 0)).toBe(true);
		expect(created.every((m) => m.createdAt === STORED_AT && m.scoringAttempts === 0)).toBe(true);
		expect(eventBus.publish).toHaveBeenCalledWith(new EmployeeJobPostCreatedEvent(created));
	});

	it('skips a pair that is already stored instead of failing the batch, and returns only the stored rows', async () => {
		const { repo } = fakeTable([['emp-1', 'job-2']]);
		const handler = new EmployeeJobPostCreateCommandHandler(repo as any, eventBus as any);
		const rows = [match('emp-1', 'job-1', { matchScore: 70 }), match('emp-1', 'job-2'), match('emp-1', 'job-3', { matchScore: 90 })];

		const created = await handler.execute(new EmployeeJobPostCreateCommand(rows));

		expect(created.map((m) => [m.jobPostId, m.matchScore])).toEqual([
			['job-1', 70],
			['job-3', 90],
		]);
		expect(new Set(created.map((m) => m.id)).size).toBe(2);
		expect(eventBus.publish.mock.calls[0][0].employeeJobPosts).toEqual(created);
	});

	it('keeps one row per pair of the batch itself', async () => {
		const { repo, qb } = fakeTable([]);
		const handler = new EmployeeJobPostCreateCommandHandler(repo as any, eventBus as any);

		const created = await handler.execute(new EmployeeJobPostCreateCommand([match('emp-1', 'job-1', { matchScore: 90 }), match('emp-1', 'job-1')]));

		expect(qb.values.mock.calls[0][0]).toHaveLength(1);
		expect(created).toEqual([expect.objectContaining({ jobPostId: 'job-1', matchScore: 90 })]);
	});

	it('announces nothing when every pair was stored already', async () => {
		const { repo } = fakeTable([['emp-1', 'job-1']]);
		const handler = new EmployeeJobPostCreateCommandHandler(repo as any, eventBus as any);

		expect(await handler.execute(new EmployeeJobPostCreateCommand([match('emp-1', 'job-1')]))).toEqual([]);
		expect(eventBus.publish).not.toHaveBeenCalled();
	});

	it('does not touch the database for an empty batch', async () => {
		const { repo } = fakeTable([]);
		const handler = new EmployeeJobPostCreateCommandHandler(repo as any, eventBus as any);

		expect(await handler.execute(new EmployeeJobPostCreateCommand([]))).toEqual([]);
		expect(repo.manager.transaction).not.toHaveBeenCalled();
	});

	it('stores the chunks in one transaction and announces nothing when one fails', async () => {
		const { repo, qb } = fakeTable([]);
		qb.execute.mockImplementationOnce(async () => undefined).mockRejectedValueOnce(new Error('connection reset'));
		const handler = new EmployeeJobPostCreateCommandHandler(repo as any, eventBus as any);
		const rows = Array.from({ length: 250 }, (_, i) => match('emp-1', `job-${i}`));

		await expect(handler.execute(new EmployeeJobPostCreateCommand(rows))).rejects.toThrow('connection reset');

		expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
		expect(eventBus.publish).not.toHaveBeenCalled();
	});

	it('inserts large batches in chunks', async () => {
		const { repo, qb } = fakeTable([]);
		const handler = new EmployeeJobPostCreateCommandHandler(repo as any, eventBus as any);
		const rows = Array.from({ length: 450 }, (_, i) => match('emp-1', `job-${i}`));

		const created = await handler.execute(new EmployeeJobPostCreateCommand(rows));

		expect(qb.values.mock.calls.map(([chunk]: [EmployeeJobPost[]]) => chunk.length)).toEqual([200, 200, 50]);
		expect(created).toHaveLength(450);
	});
});
