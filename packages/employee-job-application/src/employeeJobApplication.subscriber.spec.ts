// Mock langfuse to prevent ESM dynamic import errors in Jest (the service imports AiService)
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({ getPrompt: jest.fn(), shutdown: jest.fn() })),
}));
jest.mock('langfuse-core', () => ({ LangfuseMedia: jest.fn() }));

import { DataSource, Repository } from 'typeorm';
import { Entities } from '@packages/config/database';
import { Employee, EmployeeJobApplication, EmployeeJobPost, JobPost, Tenant, User } from '@packages/entities';
import { RequestContext } from '@packages/core/context/request-context';
import { WatchedColumnsQueryService } from '@packages/core/crud/watched-columns-query.service';
import { applicationStatusChange, notifiedApplicationStatus } from './applicationStatus';
import { EmployeeJobApplicationService } from './employeeJobApplication.service';
import { EmployeeJobApplicationSubscriber } from './employeeJobApplication.subscriber';
import { EmployeeJobApplicationStatusChangedEvent } from './events/employeeJobApplicationStatusChanged.event';
import { EmployeeJobApplicationStatusChangedEventHandler } from './handlers/employeeJobApplicationStatusChanged.handler';

describe('applicationStatusChange', () => {
	it('maps the free-text appliedStatus to the notification statuses', () => {
		expect(notifiedApplicationStatus('succeed')).toBe('applied');
		expect(notifiedApplicationStatus(' Hired ')).toBe('won');
		expect(notifiedApplicationStatus('failed')).toBeUndefined();
		expect(notifiedApplicationStatus(null)).toBeUndefined();
		// only the listed values: nothing inherited from Object.prototype
		expect(notifiedApplicationStatus('constructor')).toBeUndefined();
		expect(notifiedApplicationStatus('__proto__')).toBeUndefined();
		expect(applicationStatusChange(null, 'toString')).toBeUndefined();
	});

	it('is a change only when the notified status differs', () => {
		expect(applicationStatusChange(null, 'succeed')).toBe('applied');
		expect(applicationStatusChange('applied', 'succeed')).toBeUndefined();
		expect(applicationStatusChange('succeed', 'viewed')).toBe('viewed');
		expect(applicationStatusChange('succeed', 'failed')).toBeUndefined();
		expect(applicationStatusChange('failed', 'succeed')).toBe('applied');
	});
});

/**
 * Status changes of an application on a real (in-memory sql.js) database: finalize and every
 * entity save publish EmployeeJobApplicationStatusChangedEvent once per real change, and the
 * handler turns it into one `application-status` notification.
 */
describe('EmployeeJobApplication status notifications', () => {
	let dataSource: DataSource;
	let applications: Repository<EmployeeJobApplication>;
	let tenant: Tenant;
	let employee: Employee;
	let user: User;
	let subscriber: EmployeeJobApplicationSubscriber;
	const published: EmployeeJobApplicationStatusChangedEvent[] = [];
	const eventBus = { publish: jest.fn((event: EmployeeJobApplicationStatusChangedEvent) => published.push(event)) };

	const asTenant = <T>(fn: () => Promise<T>) =>
		RequestContext.run(new RequestContext({ tenant: { id: tenant.id } } as any, {} as any), fn);
	let jobPostCount = 0;
	/** Each application on its own job post: an employee has one match per job post (unique index on employee_job_post). */
	const createApplication = async (appliedStatus?: string) => {
		const jobPost = await dataSource
			.getRepository(JobPost)
			.save({ providerCode: 'upwork', providerJobId: `job-${++jobPostCount}`, title: 'Senior dev' });
		const match = await dataSource.getRepository(EmployeeJobPost).save({
			providerCode: 'upwork',
			employeeId: employee.id,
			jobPostId: jobPost.id,
			tenantId: tenant.id,
		});
		return applications.save(
			applications.create({
				providerCode: 'upwork',
				employeeId: employee.id,
				jobPostId: jobPost.id,
				employeeJobPostId: match.id,
				tenantId: tenant.id,
				appliedStatus,
			})
		);
	};
	const service = () => {
		const instance = Object.create(EmployeeJobApplicationService.prototype) as EmployeeJobApplicationService;
		Object.assign(instance, {
			repo: applications,
			employeeJobPostRepo: dataSource.getRepository(EmployeeJobPost),
			eventBus,
			logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
		});
		return instance;
	};

	beforeAll(async () => {
		dataSource = new DataSource({
			type: 'sqljs',
			entities: Entities,
			synchronize: true,
			invalidWhereValuesBehavior: { undefined: 'ignore' },
		} as any);
		await dataSource.initialize();
		subscriber = new EmployeeJobApplicationSubscriber(dataSource, eventBus as any);
		applications = dataSource.getRepository(EmployeeJobApplication);
		tenant = await dataSource.getRepository(Tenant).save({ name: 'Acme' });
		user = await dataSource.getRepository(User).save({ email: 'ada@example.com' });
		employee = await dataSource.getRepository(Employee).save({ firstName: 'Ada', userId: user.id, tenantId: tenant.id });
	});

	afterAll(async () => {
		await dataSource.destroy();
	});

	beforeEach(() => {
		published.length = 0;
		eventBus.publish.mockClear();
	});

	it('finalize notifies once per real change of appliedStatus', async () => {
		const application = await createApplication();
		const finalize = (appliedStatus?: string) =>
			asTenant(() => service().finalize(application.id, { appliedDate: new Date(), appliedStatus, providerJobApplicationId: 'p-1' }));

		await finalize('succeed');
		expect(published).toEqual([new EmployeeJobApplicationStatusChangedEvent(application.id, 'applied', null)]);
		expect((await applications.findOneBy({ id: application.id })).appliedStatus).toBe('succeed');

		await finalize('succeed'); // same status again
		await finalize('applied'); // another word for the same status
		await finalize(undefined); // status not given
		await finalize('failed'); // not a notified status
		expect(published).toHaveLength(1);

		await finalize('hired');
		expect(published[1]).toEqual(new EmployeeJobApplicationStatusChangedEvent(application.id, 'won', 'failed'));
	});

	it('an entity save (REST PATCH / PUT, GraphQL updateOne) notifies a real change once, after the commit', async () => {
		const application = await createApplication('applied');
		await applications.save({ ...application, appliedStatus: 'viewed' });
		await applications.save({ ...application, appliedStatus: 'viewed', proposal: 'edited' });
		await applications.save({ id: application.id, isViewedByClient: true });
		expect(published).toEqual([new EmployeeJobApplicationStatusChangedEvent(application.id, 'viewed', 'applied')]);

		await expect(
			dataSource.transaction(async (manager) => {
				await manager.save(EmployeeJobApplication, { ...application, appliedStatus: 'rejected' });
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(published).toHaveLength(1);
	});

	it('GraphQL updateMany with appliedStatus saves row by row: one event per changed row', async () => {
		const first = await createApplication();
		const second = await createApplication('shortlisted');
		const queryService = new WatchedColumnsQueryService(applications, ['appliedStatus']);
		await expect(
			queryService.updateMany({ appliedStatus: 'shortlisted' }, { id: { in: [first.id, second.id] } })
		).resolves.toEqual({ updatedCount: 2 });
		expect(published).toEqual([new EmployeeJobApplicationStatusChangedEvent(first.id, 'shortlisted', null)]);
	});

	it('two concurrent saves of the same change publish once: the stored status is read again under the lock', async () => {
		const application = await createApplication();
		await applications.save({ ...application, appliedStatus: 'rejected' }); // the first save
		expect(published).toHaveLength(1);

		// the second save loaded `databaseEntity` (no status yet) before the first one committed
		const saved = { ...application, appliedStatus: 'declined' };
		const event = { entity: saved, databaseEntity: { ...application, appliedStatus: null }, manager: dataSource.manager, queryRunner: undefined } as any;
		await subscriber.beforeUpdate(event);
		subscriber.afterUpdate(event);
		expect(published).toHaveLength(1);
	});

	it('a raw change is read again even when the stale stored value maps to the same status', async () => {
		const application = await createApplication('applied');
		await applications.update({ id: application.id }, { appliedStatus: 'viewed' }); // another writer, after this save loaded the row

		const saved = { ...application, appliedStatus: 'succeed' };
		const event = { entity: saved, databaseEntity: { ...application }, manager: dataSource.manager, queryRunner: undefined } as any;
		await subscriber.beforeUpdate(event);
		subscriber.afterUpdate(event);
		expect(published).toEqual([new EmployeeJobApplicationStatusChangedEvent(application.id, 'applied', 'viewed')]);
	});

	it('creating an application is not a status change', async () => {
		await createApplication('succeed');
		expect(published).toEqual([]);
	});

	describe('EmployeeJobApplicationStatusChangedEventHandler', () => {
		const novuService = { isEnabled: jest.fn(), sendApplicationStatus: jest.fn() };

		beforeEach(() => {
			novuService.isEnabled.mockReset().mockReturnValue(true);
			novuService.sendApplicationStatus.mockReset();
		});

		it('sends one application-status notification with the job and the new status', async () => {
			const application = await createApplication('won');
			await new EmployeeJobApplicationStatusChangedEventHandler(applications, novuService as any).handle(
				new EmployeeJobApplicationStatusChangedEvent(application.id, 'won', 'shortlisted')
			);
			expect(novuService.sendApplicationStatus).toHaveBeenCalledTimes(1);
			expect(novuService.sendApplicationStatus).toHaveBeenCalledWith(
				{ id: employee.id, firstName: 'Ada', lastName: null, userId: user.id },
				{ jobTitle: 'Senior dev', providerCode: 'upwork', status: 'won', applicationId: application.id, employeeId: employee.id }
			);
		});

		it('sends nothing to an employee of another tenant', async () => {
			const otherTenant = await dataSource.getRepository(Tenant).save({ name: 'Other' });
			const foreign = await dataSource.getRepository(Employee).save({ firstName: 'Eve', tenantId: otherTenant.id });
			const application = await createApplication('won');
			await applications.update({ id: application.id }, { employeeId: foreign.id });
			await new EmployeeJobApplicationStatusChangedEventHandler(applications, novuService as any).handle(
				new EmployeeJobApplicationStatusChangedEvent(application.id, 'won')
			);
			expect(novuService.sendApplicationStatus).not.toHaveBeenCalled();
		});

		it('sends nothing when Novu is not configured or switched off', async () => {
			novuService.isEnabled.mockReturnValue(false);
			const application = await createApplication('won');
			await new EmployeeJobApplicationStatusChangedEventHandler(applications, novuService as any).handle(
				new EmployeeJobApplicationStatusChangedEvent(application.id, 'won')
			);
			expect(novuService.sendApplicationStatus).not.toHaveBeenCalled();
		});
	});
});
