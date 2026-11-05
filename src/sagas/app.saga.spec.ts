// Mock langfuse to prevent ESM dynamic import errors in Jest (the application service imports AiService)
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({ getPrompt: jest.fn(), shutdown: jest.fn() })),
}));
jest.mock('langfuse-core', () => ({ LangfuseMedia: jest.fn() }));

import { ICommand } from '@nestjs/cqrs';
import { firstValueFrom, of, Subject, toArray } from 'rxjs';
import { RequestContext } from '@packages/core/context/request-context';
import { AutomationTaskCreateCommand } from '@packages/automationTask/commands/automationTaskCreate.command';
import { EmployeeJobApplicationCreateCommand } from '@packages/employeeJobApplication/commands/employeeJobApplicationCreate.command';
import { EmployeeJobApplicationController } from '@packages/employeeJobApplication/employeeJobApplication.controller';
import { EmployeeJobApplicationService } from '@packages/employeeJobApplication/employeeJobApplication.service';
import { EmployeeJobApplicationCreateCommandHandler } from '@packages/employeeJobApplication/handlers/employeeJobApplicationCreate.handler';
import { EmployeeJobApplicationResolver } from '@packages/employeeJobApplication/resolvers/employeeJobApplication.resolver';
import { JobPost } from '@packages/entities';
import { JobPostCreatedEvent } from '@packages/jobPost/events/jobPostCreated.event';
import { JobPostUpdatedEvent } from '@packages/jobPost/events/jobPostUpdated.event';
import { MatchJobPostsToEmployeesCommand } from '@packages/employeeJobPost/commands/matchJobPostsToEmployees.command';
import { AppSagas } from './app.saga';

/**
 * The application flow end to end (repositories in memory): GraphQL `applyToJob` and REST
 * `/process` both go through EmployeeJobApplicationCreateCommand, so each submission produces
 * exactly one `apply_job` automation task, and the proposal is generated once (by the command
 * handler) and carried unchanged into the task.
 */
describe('Application flow: one automation task and one proposal per submission', () => {
	const TENANT = 't-1';
	const jobPost = { id: 'jp-1', providerCode: 'upwork', providerJobId: 'job-1', title: 'Senior dev', description: 'Build it', skills: 'Node', category: 'Web' };
	const employee = { id: 'emp-1', tenantId: TENANT, orgId: 'o-1', firstName: 'Ada', lastName: 'Lovelace' };
	const match = { id: 'ejp-1', employeeId: 'emp-1', jobPostId: 'jp-1', providerCode: 'upwork', providerJobId: 'job-1', tenantId: TENANT, jobPost, employee };

	let rows: Map<string, Record<string, any>>;
	let commands: ICommand[];
	let aiService: { generateProposal: jest.Mock };
	let commandBus: { execute: jest.Mock };
	let service: EmployeeJobApplicationService;
	let controller: EmployeeJobApplicationController;

	const findRow = (where: Record<string, unknown>) =>
		[...rows.values()].find((candidate) => Object.entries(where).every(([key, value]) => value === undefined || candidate[key] === value));
	/** The EmployeeJobApplication table: rows by id, relations attached on read. */
	const applicationRepo = {
		findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
			const row = findRow(where);
			return row ? { ...row, jobPost, employeeJobPost: match } : null;
		}),
		exists: jest.fn(async ({ where }: { where: Record<string, unknown> }) => !!findRow(where)),
		save: jest.fn(async (entity: Record<string, any>) => {
			const id = entity.id ?? `app-${rows.size + 1}`;
			const { employee: _e, jobPost: _j, employeeJobPost: _m, ...columns } = entity;
			rows.set(id, { ...rows.get(id), ...Object.fromEntries(Object.entries(columns).filter(([, v]) => v !== undefined)), id });
			return Object.assign(entity, { id });
		}),
		update: jest.fn(async ({ id }: { id: string }, patch: Record<string, unknown>) => {
			rows.set(id, { ...rows.get(id), ...patch });
			return { affected: 1 };
		}),
	};
	const asTenant = <T>(fn: () => Promise<T>) =>
		RequestContext.run(new RequestContext({ tenant: { id: TENANT } } as any, {} as any), fn);
	const tasks = () =>
		commands
			.filter((command): command is AutomationTaskCreateCommand => command instanceof AutomationTaskCreateCommand)
			.map((command) => ({ ...command.automationTask, payload: JSON.parse(command.automationTask.command) }));

	beforeEach(() => {
		rows = new Map();
		commands = [];
		console.log = jest.fn();
		applicationRepo.findOne.mockClear();
		applicationRepo.save.mockClear();
		aiService = { generateProposal: jest.fn().mockResolvedValue({ proposal: 'AI proposal', qa: '[{"q":"Q","a":"A"}]' }) };

		const events$ = new Subject<unknown>();
		new AppSagas().createAutomationTask(events$).subscribe((command) => commands.push(command));
		const eventBus = { publish: (event: unknown) => events$.next(event) };

		service = Object.create(EmployeeJobApplicationService.prototype);
		const handler = new EmployeeJobApplicationCreateCommandHandler(
			applicationRepo as any,
			{ findOne: jest.fn().mockResolvedValue(employee) } as any,
			{ findOne: jest.fn().mockResolvedValue(match) } as any,
			{ findOne: jest.fn().mockResolvedValue(jobPost) } as any,
			eventBus as any,
			service
		);
		commandBus = { execute: jest.fn((command: EmployeeJobApplicationCreateCommand) => handler.execute(command)) };
		Object.assign(service, {
			repo: applicationRepo,
			employeeJobPostRepo: { findOne: jest.fn().mockResolvedValue(match) },
			aiService,
			commandBus,
			eventBus,
			logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
		});

		controller = new EmployeeJobApplicationController(
			service,
			aiService as any,
			commandBus as any,
			{ findOne: jest.fn().mockResolvedValue(jobPost), save: jest.fn() } as any,
			{ findOne: jest.fn().mockResolvedValue(match), save: jest.fn() } as any,
			applicationRepo as any,
			{ exists: jest.fn().mockResolvedValue(true) } as any
		);
	});

	it('GraphQL applyToJob: one application, one AI proposal, one automation task carrying it', async () => {
		const resolver = new EmployeeJobApplicationResolver({} as any, {} as any, service);

		const application = await asTenant(() => resolver.applyToJob('ejp-1'));

		expect(commandBus.execute).toHaveBeenCalledTimes(1);
		expect(aiService.generateProposal).toHaveBeenCalledTimes(1);
		expect(rows.size).toBe(1);
		expect(application).toMatchObject({ id: 'app-1', proposal: 'AI proposal', isProposalGeneratedByAI: true, qa: '[{"q":"Q","a":"A"}]' });
		expect(tasks()).toHaveLength(1);
		expect(tasks()[0]).toMatchObject({
			status: 'open',
			commandType: 'apply_job',
			employeeId: 'emp-1',
			tenantId: TENANT,
			payload: { employeeJobApplicationId: 'app-1', proposal: 'AI proposal', isProposalGeneratedByAI: true, jobTitle: 'Senior dev' },
		});
	});

	it('GraphQL applyToJob when the AI call fails: the application stays a draft without a task, and its status says why', async () => {
		aiService.generateProposal.mockRejectedValue(new Error('model timeout'));

		const application = await asTenant(() => service.apply('ejp-1'));

		expect(aiService.generateProposal).toHaveBeenCalledTimes(1);
		expect(application.proposal).toBeUndefined();
		expect(rows.size).toBe(1);
		expect(tasks()).toHaveLength(0);
		const status = await asTenant(() => service.getApplicationStatus(application.id));
		expect(status.automationTaskBlockers).toEqual(['no proposal: write one or generate it (generate-proposal), then submit again']);
	});

	it('REST /process is unchanged: one command, one task; a supplied proposal is never regenerated', async () => {
		const dto: any = { employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', proposal: 'Written by me' };

		const result = await asTenant(() => controller.Process({} as any, dto));

		expect(commandBus.execute).toHaveBeenCalledTimes(1);
		expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(EmployeeJobApplicationCreateCommand);
		expect(result).toMatchObject({ id: 'app-1', employeeJobPostId: 'ejp-1', jobPostId: 'jp-1', tenantId: TENANT });
		expect(result).toMatchObject({ automationTaskQueued: true, automationTaskBlockers: [] });
		expect(aiService.generateProposal).not.toHaveBeenCalled();
		expect(tasks()).toHaveLength(1);
		expect(tasks()[0].payload.proposal).toBe('Written by me');
	});

	it('REST /process without a proposal: generated once, stored on the application and copied into the task', async () => {
		const dto: any = { employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1' };

		await asTenant(() => controller.Process({} as any, dto));

		expect(aiService.generateProposal).toHaveBeenCalledTimes(1);
		expect(rows.get('app-1')).toMatchObject({ proposal: 'AI proposal', isProposalGeneratedByAI: true });
		expect(tasks()).toHaveLength(1);
		expect(tasks()[0].payload.proposal).toBe('AI proposal');
	});

	it('GraphQL applyToJob refuses a match whose employee belongs to another tenant: no command, no task', async () => {
		(service as any).employeeJobPostRepo.findOne.mockResolvedValue({ ...match, employee: { ...employee, tenantId: 't-2' } });

		await expect(asTenant(() => service.apply('ejp-1'))).rejects.toThrow('does not belong to this tenant');

		expect(commandBus.execute).not.toHaveBeenCalled();
		expect(rows.size).toBe(0);
		expect(tasks()).toHaveLength(0);
	});

	it('REST /process with the id of an application of another tenant: not found, no task', async () => {
		rows.set('app-foreign', { id: 'app-foreign', tenantId: 't-2', employeeId: 'emp-9', proposal: 'their proposal' });
		const dto: any = { id: 'app-foreign', employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1' };

		await expect(asTenant(() => controller.Process({} as any, dto))).rejects.toThrow('not found');

		expect(aiService.generateProposal).not.toHaveBeenCalled();
		expect(tasks()).toHaveLength(0);
	});

	it('REST /process with the id of another application of the same tenant (other match): not found, nothing touched', async () => {
		const other = { id: 'app-other', tenantId: TENANT, employeeId: 'emp-1', jobPostId: 'jp-2', employeeJobPostId: 'ejp-2', proposal: 'For the other job' };
		rows.set(other.id, { ...other });
		const dto: any = { id: other.id, employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', proposal: 'Overwrite?' };

		await expect(asTenant(() => controller.Process({} as any, dto))).rejects.toThrow('not found for this employee and job post');

		expect(rows.get(other.id)).toEqual(other);
		expect(tasks()).toHaveLength(0);
	});

	it('REST /process and pre-process refuse a match that belongs to another job post', async () => {
		const matches = (controller as any).employeeJobPostRepository;
		matches.findOne.mockResolvedValue({ ...match, jobPostId: 'jp-other' });
		const dto = (): any => ({ employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', jobPost: { ...jobPost }, proposal: 'P' });

		await expect(asTenant(() => controller.Process({} as any, dto()))).rejects.toThrow('is a match for another job post');
		await expect(asTenant(() => controller.PreProcess({} as any, dto()))).rejects.toThrow('is a match for another job post');

		expect(rows.size).toBe(0);
		expect(tasks()).toHaveLength(0);
	});

	it('a draft with unanswered screening questions is not sent; answering them sends it, once', async () => {
		const dto = (): any => ({ employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', jobPost: { ...jobPost } });
		const draft = await asTenant(() => controller.PreProcess({} as any, { ...dto(), qa: '[{"q":"Availability?","a":""}]' }));

		const blocked = await asTenant(() => controller.Process({} as any, dto()));
		expect(blocked).toMatchObject({ id: draft.id, automationTaskQueued: false, automationTaskBlockers: ['1 screening question(s) without an answer'] });
		expect(tasks()).toHaveLength(0);

		const sent = await asTenant(() => controller.Process({} as any, { ...dto(), qa: '[{"q":"Availability?","a":"Full time"}]' }));
		expect(sent).toMatchObject({ automationTaskQueued: true, automationTaskBlockers: [] });
		expect(rows.get(draft.id)).toMatchObject({ qa: '[{"q":"Availability?","a":"Full time"}]' });
		expect(tasks()).toHaveLength(1);
		expect(tasks()[0].payload).toMatchObject({ proposal: 'AI proposal', qa: '[{"q":"Availability?","a":"Full time"}]' });
	});

	it('the stored application and its task carry the same provenance flag', async () => {
		const dto = (): any => ({ employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', jobPost: { ...jobPost } });
		const draft = await asTenant(() => controller.PreProcess({} as any, dto())); // AI draft: flag true

		// the same proposal, explicitly marked as not AI-generated: stored and sent as false
		await asTenant(() => controller.Process({} as any, { ...dto(), proposal: 'AI proposal', isProposalGeneratedByAI: false }));
		expect(rows.get(draft.id)?.isProposalGeneratedByAI).toBe(false);
		expect(tasks()[0].payload.isProposalGeneratedByAI).toBe(false);

		// an edited proposal without a flag: the stored flag stays and is sent
		await asTenant(() => controller.Process({} as any, { ...dto(), proposal: 'Edited' }));
		expect(rows.get(draft.id)?.isProposalGeneratedByAI).toBe(false);
		expect(tasks()[1].payload.isProposalGeneratedByAI).toBe(false);
	});

	it('the task of a reused draft carries the stored values the submission left out', async () => {
		const dto = (): any => ({ employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', jobPost: { ...jobPost } });
		await asTenant(() => controller.PreProcess({} as any, { ...dto(), rate: 75, terms: '{"type":"project"}' }));

		await asTenant(() => controller.Process({} as any, { ...dto(), proposal: 'Edited' }));

		expect(tasks()).toHaveLength(1);
		expect(tasks()[0].payload).toMatchObject({ proposal: 'Edited', rate: 75, terms: '{"type":"project"}' });
	});

	it('pre-process (a draft, no task) then /process: the draft proposal is reused, one task in total', async () => {
		const dto = (): any => ({ employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', jobPost: { ...jobPost } });

		const draft = await asTenant(() => controller.PreProcess({} as any, dto()));
		expect(draft.proposal).toBe('AI proposal');
		expect(tasks()).toHaveLength(0);

		await asTenant(() => controller.Process({} as any, dto()));

		expect(aiService.generateProposal).toHaveBeenCalledTimes(1);
		expect(rows.size).toBe(1);
		expect(tasks()).toHaveLength(1);
		expect(tasks()[0].payload).toMatchObject({ employeeJobApplicationId: draft.id, proposal: 'AI proposal' });
	});

	it('pre-process then /process with an empty proposal: the draft is reused, not overwritten or regenerated', async () => {
		const dto = (): any => ({ employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', jobPost: { ...jobPost } });
		const draft = await asTenant(() => controller.PreProcess({} as any, dto()));

		await asTenant(() => controller.Process({} as any, { ...dto(), proposal: '' }));
		await asTenant(() => controller.Process({} as any, { ...dto(), proposal: null, isProposalGeneratedByAI: false }));

		expect(aiService.generateProposal).toHaveBeenCalledTimes(1); // the draft only
		// the kept AI proposal keeps its provenance: the flag is stored only with a replacement proposal
		expect(rows.get(draft.id)).toMatchObject({ proposal: 'AI proposal', isProposalGeneratedByAI: true });
		expect(tasks().map((task) => [task.payload.proposal, task.payload.isProposalGeneratedByAI])).toEqual([
			['AI proposal', true],
			['AI proposal', true],
		]);
	});

	it('pre-process then /process with an edited proposal: the application stores what its task sends', async () => {
		const dto = (): any => ({ employeeId: 'emp-1', providerCode: 'upwork', providerJobId: 'job-1', employeeJobPostId: 'ejp-1', jobPost: { ...jobPost } });
		const draft = await asTenant(() => controller.PreProcess({} as any, dto()));

		await asTenant(() => controller.Process({} as any, { ...dto(), proposal: 'Edited by me', rate: 60 }));

		expect(aiService.generateProposal).toHaveBeenCalledTimes(1); // the draft only
		expect(rows.get(draft.id)).toMatchObject({ proposal: 'Edited by me', rate: 60 });
		expect(tasks()).toHaveLength(1);
		expect(tasks()[0].payload).toMatchObject({ proposal: 'Edited by me', rate: 60 });
	});
});

describe('AppSagas – matching', () => {
	const sagas = new AppSagas();
	const posts = [{ id: 'job-1' }] as JobPost[];

	it('matches newly stored posts against every employee', async () => {
		const commands = await firstValueFrom(sagas.matchJobsToEmployees(of(new JobPostCreatedEvent(posts))).pipe(toArray()));

		expect(commands).toEqual([new MatchJobPostsToEmployeesCommand(posts)]);
		expect((commands[0] as MatchJobPostsToEmployeesCommand).options.existing).toBeUndefined();
	});

	it('re-matches posts that were already stored (found again, or re-offered by source-db)', async () => {
		const commands = await firstValueFrom(sagas.rematchJobsToEmployees(of(new JobPostUpdatedEvent(posts))).pipe(toArray()));

		expect(commands).toEqual([new MatchJobPostsToEmployeesCommand(posts, { existing: true })]);
	});

	it('each saga reacts to its own event only', async () => {
		const created = await firstValueFrom(sagas.matchJobsToEmployees(of(new JobPostUpdatedEvent(posts))).pipe(toArray()));
		const updated = await firstValueFrom(sagas.rematchJobsToEmployees(of(new JobPostCreatedEvent(posts))).pipe(toArray()));

		expect(created).toEqual([]);
		expect(updated).toEqual([]);
	});
});
