import { DataSource, Repository } from 'typeorm';
import {
	AutomationTask,
	Employee,
	EmployeeJobApplication,
	EmployeeJobPost,
	JobPost,
	JobSearchCriterion,
	Organization,
	SourceConfig,
	Tenant,
	TenantApiKey,
	User,
} from '@packages/entities';
import { IJobProvider, LivenessJob } from '@packages/core-providers';
import { JobPostService } from './jobPost.service';

// the CRUD base class pulls in the whole @dataui stack; only the repository matters here
jest.mock('@dataui/crud-typeorm', () => ({
	TypeOrmCrudService: class {
		protected repo: any;
		constructor(repo: any) {
			this.repo = repo;
		}
	},
}));

/**
 * The candidate tenants a background liveness check offers to an API-backed verifier, against a real
 * (in-memory sql.js) database: the "usable credentials" filter must run in SQL, before the limit.
 */
describe('JobPostService — credential tenants of a background check (sql.js)', () => {
	let ds: DataSource;
	let jobPosts: Repository<JobPost>;
	let service: JobPostService;
	let offered: string[] | undefined;
	let offeredAll: string[] | undefined;

	/** A verifier that only records the tenants it is offered (for its source, and unfiltered). */
	const recorder: IJobProvider = {
		providerCode: 'upwork',
		providerName: 'records tenantIds()',
		getJobs: async () => [],
		isEnabled: async () => true,
		canVerify: () => true,
		verifyJob: async (_url: string, job?: LivenessJob) => {
			offered = await job?.tenantIds?.('upwork');
			offeredAll = await job?.tenantIds?.();
			return { isOpen: true, verified: false, reason: 'recording only' };
		},
	};

	beforeAll(async () => {
		ds = await new DataSource({
			type: 'sqljs',
			entities: [Tenant, TenantApiKey, Organization, User, Employee, EmployeeJobPost, EmployeeJobApplication, AutomationTask, JobPost, SourceConfig, JobSearchCriterion],
			synchronize: true,
			logging: false,
		}).initialize();
		jobPosts = ds.getRepository(JobPost);
		service = new JobPostService(jobPosts, [recorder]);
	});

	afterAll(async () => {
		await ds?.destroy();
	});

	beforeEach(() => {
		offered = undefined;
		offeredAll = undefined;
	});

	/** A post matched for `count` tenants (named t00…), returning their ids in creation order. */
	const postMatchedFor = async (count: number) => {
		const post = await jobPosts.save(
			jobPosts.create({ providerCode: 'upwork', providerJobId: `${Date.now()}${Math.random()}`, title: 'Upwork posting', ingestedBy: 'upwork', url: 'https://www.upwork.com/jobs/~01' })
		);
		const tenantIds: string[] = [];
		for (let i = 0; i < count; i++) {
			const tenant = await ds.getRepository(Tenant).save({ name: `t${String(i).padStart(2, '0')}` });
			const employee = await ds.getRepository(Employee).save({ tenantId: tenant.id } as Employee);
			await ds.getRepository(EmployeeJobPost).save({ tenantId: tenant.id, employeeId: employee.id, jobPostId: post.id, providerCode: 'upwork' } as EmployeeJobPost);
			tenantIds.push(tenant.id);
		}
		return { post, tenantIds };
	};
	const config = (tenantId: string, fields: Partial<SourceConfig>) =>
		ds.getRepository(SourceConfig).save({ tenantId, sourceCode: 'upwork', isActive: true, isArchived: false, ...fields } as SourceConfig);

	it('offers a matched tenant with usable credentials even when ten matched tenants without them come first', async () => {
		const { post, tenantIds } = await postMatchedFor(12);
		// the first eleven have nothing usable: no config, a client id without secret, an inactive or
		// archived config, an empty token, a config for another source
		await config(tenantIds[1], { clientId: 'only-an-id' });
		await config(tenantIds[2], { accessToken: 'inactive', isActive: false });
		await config(tenantIds[3], { accessToken: 'archived', isArchived: true });
		await config(tenantIds[4], { accessToken: '' });
		await config(tenantIds[5], { sourceCode: 'linkedin', accessToken: 'other-source' });
		// only the last matched tenant can serve the check
		await config(tenantIds[11], { clientId: 'id', clientSecret: 'secret' });

		await service.checkLiveness(post.id);

		expect(offered).toEqual([tenantIds[11]]);
		expect(offeredAll).toHaveLength(10); // without a source: the matched tenants, capped
	});

	it('offers every matched tenant with an access token or a client id and secret, and only those', async () => {
		const { post, tenantIds } = await postMatchedFor(3);
		await config(tenantIds[0], { accessToken: 'token' });
		await config(tenantIds[2], { clientId: 'id', clientSecret: 'secret' });

		await service.checkLiveness(post.id);

		expect([...(offered ?? [])].sort()).toEqual([tenantIds[0], tenantIds[2]].sort());
	});

	it('offers nothing when no matched tenant has credentials of its own (the verifier falls back to deployment-wide ones)', async () => {
		const { post } = await postMatchedFor(2);

		await service.checkLiveness(post.id);

		expect(offered).toEqual([]);
	});
});
