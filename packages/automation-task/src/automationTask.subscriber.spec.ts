import { DataSource, EntityManager, Repository } from 'typeorm';
import { CrudRequest } from '@dataui/crud';
import { Entities } from '@packages/config/database';
import { AutomationTask, Employee, Tenant, User } from '@packages/entities';
import { RequestContext } from '@packages/core/context/request-context';
import { WatchedColumnsQueryService } from '@packages/core/crud/watched-columns-query.service';
import { OpsService } from '@packages/ops/ops.service';
import { AutomationTaskService } from './automationTask.service';
import { AutomationTaskSubscriber } from './automationTask.subscriber';
import { AutomationTaskFinishedEvent } from './events/automationTaskFinished.event';
import { AutomationTaskFinishedEventHandler } from './handlers/automationTaskFinished.handler';

/**
 * Terminal transitions of an automation task, on a real (in-memory sql.js) database: every write
 * path publishes AutomationTaskFinishedEvent exactly once per transition, after the commit, and
 * the handler turns it into one `automation-task-complete` notification.
 */
describe('AutomationTaskSubscriber (task outcome notifications)', () => {
	let dataSource: DataSource;
	let tasks: Repository<AutomationTask>;
	let tenant: Tenant;
	let employee: Employee;
	let user: User;
	let subscriber: AutomationTaskSubscriber;
	const published: AutomationTaskFinishedEvent[] = [];
	const eventBus = { publish: jest.fn((event: AutomationTaskFinishedEvent) => published.push(event)) };

	const asTenant = <T>(fn: () => Promise<T>) =>
		RequestContext.run(new RequestContext({ tenant: { id: tenant.id } } as any, {} as any), fn);
	const createTask = (status: string, extra: Partial<AutomationTask> = {}) =>
		tasks.save(tasks.create({ status, commandType: 'apply_job', isBroadcast: false, tenantId: tenant.id, employeeId: employee.id, ...extra }));
	/** The request @dataui/crud builds for `PATCH /api/automation/task/:id`. */
	const patchRequest = (id: string): CrudRequest =>
		({
			parsed: {
				fields: [],
				paramsFilter: [{ field: 'id', operator: '$eq', value: id }],
				search: { $and: [{ id: { $eq: id } }] },
				authPersist: {},
				classTransformOptions: {},
				filter: [],
				or: [],
				join: [],
				sort: [],
			},
			options: {
				query: {},
				routes: { updateOneBase: { allowParamsOverride: false, returnShallow: true } },
				params: { id: { field: 'id', type: 'uuid', primary: true } },
			},
		}) as unknown as CrudRequest;

	beforeAll(async () => {
		dataSource = new DataSource({
			type: 'sqljs',
			entities: Entities,
			synchronize: true,
			invalidWhereValuesBehavior: { undefined: 'ignore' },
		} as any);
		await dataSource.initialize();
		subscriber = new AutomationTaskSubscriber(dataSource, eventBus as any);
		new AutomationTaskSubscriber(dataSource, eventBus as any); // a second instance does not register twice
		tasks = dataSource.getRepository(AutomationTask);
		tenant = await dataSource.getRepository(Tenant).save({ name: 'Acme' });
		user = await dataSource.getRepository(User).save({ email: 'ada@example.com' });
		employee = await dataSource.getRepository(Employee).save({ firstName: 'Ada', lastName: 'Lovelace', userId: user.id, tenantId: tenant.id });
	});

	afterAll(async () => {
		await dataSource.destroy();
	});

	beforeEach(() => {
		published.length = 0;
		eventBus.publish.mockClear();
	});

	it('REST PATCH: a terminal transition is published once, a repeat of it is not', async () => {
		const task = await createTask('open');
		const service = new AutomationTaskService(tasks);

		await asTenant(() => service.updateOne(patchRequest(task.id), { status: 'completed' }));
		expect(published).toEqual([new AutomationTaskFinishedEvent(task.id, 'completed', 'open')]);

		await asTenant(() => service.updateOne(patchRequest(task.id), { status: 'completed', commandResult: '{"ok":true}' }));
		expect(published).toHaveLength(1);
	});

	it('a non-terminal change and a save that does not write the status publish nothing', async () => {
		const task = await createTask('open');
		await tasks.save({ ...task, status: 'in_progress' });
		await tasks.save({ id: task.id, executionTime: 12 });
		expect(published).toEqual([]);
	});

	it('GraphQL updateOne and updateMany (status written): each transition once', async () => {
		const service = new WatchedColumnsQueryService(tasks, ['status']);
		const one = await createTask('in_progress');
		await service.updateOne(one.id, { status: 'failed', commandResult: '{"error":"captcha"}' });
		// the error of this write travels with the event
		expect(published).toEqual([new AutomationTaskFinishedEvent(one.id, 'failed', 'in_progress', 'captcha')]);

		published.length = 0;
		const open = await createTask('open');
		const done = await createTask('completed');
		published.length = 0; // creating `done` already finished was its own (insert) event
		// what each save is given (TypeORM fills the object it saves afterwards, so copy it at the call)
		const saved: unknown[] = [];
		const save = EntityManager.prototype.save;
		const spy = jest.spyOn(EntityManager.prototype, 'save').mockImplementation(function (this: EntityManager, ...args: any[]) {
			saved.push({ ...args[1] });
			return (save as (...a: any[]) => Promise<unknown>).apply(this, args);
		} as any);
		try {
			const result = await service.updateMany({ status: 'completed' }, { id: { in: [open.id, done.id] } });
			expect(result).toEqual({ updatedCount: 2 });
		} finally {
			spy.mockRestore();
		}
		// the task that was already completed is not a transition
		expect(published).toEqual([new AutomationTaskFinishedEvent(open.id, 'completed', 'open')]);
		// only the id and the requested values are written: a concurrent change of another column survives
		expect(saved).toEqual(expect.arrayContaining([{ status: 'completed', id: open.id }, { status: 'completed', id: done.id }]));
		expect(saved).toHaveLength(2);
	});

	it('two concurrent saves of the same transition publish once: the stored status is read again under the lock', async () => {
		const task = await createTask('open');
		await tasks.save({ ...task, status: 'completed' }); // the first save
		expect(published).toHaveLength(1);

		// the second save loaded `databaseEntity` (still `open`) before the first one committed
		const saved = { ...task, status: 'completed' };
		const event = { entity: saved, databaseEntity: { ...task, status: 'open' }, manager: dataSource.manager, queryRunner: undefined } as any;
		await subscriber.beforeUpdate(event);
		subscriber.afterUpdate(event);
		expect(published).toHaveLength(1);
	});

	it('GraphQL updateMany without a status stays one bulk statement and publishes nothing', async () => {
		const service = new WatchedColumnsQueryService(tasks, ['status']);
		const task = await createTask('open');
		const save = jest.spyOn(EntityManager.prototype, 'save');
		try {
			await expect(service.updateMany({ executionTime: 3 }, { id: { eq: task.id } })).resolves.toEqual({ updatedCount: 1 });
			expect(save).not.toHaveBeenCalled();
		} finally {
			save.mockRestore();
		}
		expect(published).toEqual([]);
	});

	it('the error of a failed transition is the result this save wrote, else the stored one (not a stale copy)', async () => {
		const task = await createTask('in_progress');
		await tasks.update({ id: task.id }, { commandResult: '{"error":"newer"}' }); // another writer, after this save loaded the row
		const stale = { ...task, status: 'failed', commandResult: '{"error":"stale"}' };
		const notWritten = { entity: stale, databaseEntity: { ...task }, manager: dataSource.manager, queryRunner: undefined, updatedColumns: [] } as any;
		await subscriber.beforeUpdate(notWritten);
		subscriber.afterUpdate(notWritten);
		expect(published).toEqual([new AutomationTaskFinishedEvent(task.id, 'failed', 'in_progress', 'newer')]);

		published.length = 0;
		const written = { ...notWritten, entity: { ...stale }, updatedColumns: [{ propertyName: 'status' }, { propertyName: 'commandResult' }] };
		await subscriber.beforeUpdate(written);
		subscriber.afterUpdate(written);
		expect(published).toEqual([new AutomationTaskFinishedEvent(task.id, 'failed', 'in_progress', 'stale')]);
	});

	it('a task created already finished is published once (AutomationTaskCreateCommand, REST / GraphQL create)', async () => {
		const task = await createTask('timeout');
		expect(published).toEqual([new AutomationTaskFinishedEvent(task.id, 'timeout')]);
		await createTask('open');
		expect(published).toHaveLength(1);
		const failed = await createTask('failed', { commandResult: '{"message":"login required"}' });
		expect(published[1]).toEqual(new AutomationTaskFinishedEvent(failed.id, 'failed', undefined, 'login required'));
	});

	it('publishes after the commit and nothing for a rolled-back write or savepoint', async () => {
		const kept = await createTask('open');
		const rolledBack = await createTask('open');
		const inSavepoint = await createTask('open');

		await expect(
			dataSource.transaction(async (manager) => {
				await manager.save(AutomationTask, { ...rolledBack, status: 'completed' });
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(published).toEqual([]);

		await dataSource.transaction(async (manager) => {
			await manager.save(AutomationTask, { ...kept, status: 'completed' });
			await manager
				.transaction(async (inner) => {
					await inner.save(AutomationTask, { ...inSavepoint, status: 'failed' });
					throw new Error('savepoint');
				})
				.catch(() => undefined);
			expect(published).toEqual([]); // not before the commit
		});
		expect(published).toEqual([new AutomationTaskFinishedEvent(kept.id, 'completed', 'open')]);
		expect((await tasks.findOneBy({ id: inSavepoint.id })).status).toBe('open');
	});

	it('the stale-task cleanup publishes one timeout per task it moved, none for a task finished meanwhile', async () => {
		const stale = await createTask('open');
		const finishedMeanwhile = await createTask('in_progress');
		const recent = await createTask('open');
		const old = new Date(Date.now() - 48 * 3600 * 1000);
		await tasks.update({ id: stale.id }, { createdAt: old });
		await tasks.update({ id: finishedMeanwhile.id }, { createdAt: old });

		// the client finishes one task between the cleanup's read and its write
		const tasksRepo = Object.create(tasks) as Repository<AutomationTask>;
		tasksRepo.find = async (options) => {
			const found = await tasks.find(options);
			await tasks.save({ ...(await tasks.findOneBy({ id: finishedMeanwhile.id })), status: 'completed' });
			return found;
		};
		const ops = new OpsService(
			{} as any,
			{} as any,
			tasksRepo,
			{} as any,
			{} as any,
			{ staleTaskTimeoutHours: () => 24 } as any,
			{} as any,
			eventBus as any
		);

		await expect(ops.cleanupStaleTasks()).resolves.toEqual({ timeoutHours: 24, tasksTimedOut: 1 });
		expect(published).toEqual([
			new AutomationTaskFinishedEvent(finishedMeanwhile.id, 'completed', 'in_progress'), // the client's own transition
			new AutomationTaskFinishedEvent(stale.id, 'timeout', 'open'),
		]);
		expect((await tasks.findOneBy({ id: finishedMeanwhile.id })).status).toBe('completed');
		expect((await tasks.findOneBy({ id: recent.id })).status).toBe('open');
	});

	describe('AutomationTaskFinishedEventHandler', () => {
		const novuService = { isEnabled: jest.fn(), sendAutomationTaskComplete: jest.fn() };
		const handler = () => new AutomationTaskFinishedEventHandler(tasks, novuService as any);

		beforeEach(() => {
			novuService.isEnabled.mockReset().mockReturnValue(true);
			novuService.sendAutomationTaskComplete.mockReset();
		});

		it('sends one automation-task-complete notification to the employee, with the error of the failing write', async () => {
			const task = await createTask('failed', {
				command: JSON.stringify({ jobTitle: 'Senior dev', password: 'never-sent' }),
				// a later write may have replaced the result: the event's own error is used
				commandResult: JSON.stringify({ ok: true }),
			});
			await handler().handle(new AutomationTaskFinishedEvent(task.id, 'failed', 'in_progress', 'Captcha required'));
			expect(novuService.sendAutomationTaskComplete).toHaveBeenCalledTimes(1);
			expect(novuService.sendAutomationTaskComplete).toHaveBeenCalledWith(
				{ id: employee.id, firstName: 'Ada', lastName: 'Lovelace', userId: user.id },
				{ taskId: task.id, commandType: 'apply_job', status: 'failed', employeeId: employee.id, jobTitle: 'Senior dev', errorMessage: 'Captcha required' }
			);
		});

		it('sends nothing without Novu (no key or plugin off) or without an employee', async () => {
			const broadcast = await createTask('completed', { employeeId: null, isBroadcast: true });
			await handler().handle(new AutomationTaskFinishedEvent(broadcast.id, 'completed', 'open'));
			novuService.isEnabled.mockReturnValue(false);
			const task = await createTask('completed');
			await handler().handle(new AutomationTaskFinishedEvent(task.id, 'completed', 'open'));
			expect(novuService.sendAutomationTaskComplete).not.toHaveBeenCalled();
		});

		it('sends nothing to an employee of another tenant', async () => {
			const otherTenant = await dataSource.getRepository(Tenant).save({ name: 'Other' });
			const foreign = await dataSource.getRepository(Employee).save({ firstName: 'Eve', tenantId: otherTenant.id });
			const task = await createTask('completed', { employeeId: foreign.id });
			await handler().handle(new AutomationTaskFinishedEvent(task.id, 'completed', 'open'));
			expect(novuService.sendAutomationTaskComplete).not.toHaveBeenCalled();
		});
	});
});
