import {
	ServerTimestampsCreateManyHook,
	ServerTimestampsCreateOneHook,
	ServerTimestampsUpdateManyHook,
	ServerTimestampsUpdateOneHook,
} from './server-timestamps.hook';

/** createdAt / updatedAt are stamped by the database, never taken from a mutation input. */
describe('ServerTimestamps hooks', () => {
	const stamped = { keyword: 'react', createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' };

	it('drop createdAt / updatedAt from create inputs (one and many)', async () => {
		expect(await new ServerTimestampsCreateOneHook<any>().run({ input: { ...stamped } })).toEqual({ input: { keyword: 'react' } });
		expect(await new ServerTimestampsCreateManyHook<any>().run({ input: [{ ...stamped }, { keyword: 'node' }] })).toEqual({
			input: [{ keyword: 'react' }, { keyword: 'node' }],
		});
	});

	it('drop createdAt / updatedAt from updates (one and many), keeping id and filter', async () => {
		expect(await new ServerTimestampsUpdateOneHook<any>().run({ id: 'c-1', update: { ...stamped } })).toEqual({ id: 'c-1', update: { keyword: 'react' } });
		const filter = { employeeId: { eq: 'e-1' } };
		expect(await new ServerTimestampsUpdateManyHook<any, any>().run({ filter, update: { updatedAt: '2099-01-01T00:00:00Z' } })).toEqual({ filter, update: {} });
	});

	it('leave inputs without timestamps (or without an input) as they are', async () => {
		expect(await new ServerTimestampsCreateOneHook<any>().run({ input: { keyword: 'react' } })).toEqual({ input: { keyword: 'react' } });
		expect(await new ServerTimestampsUpdateOneHook<any>().run({ id: 'c-1' } as any)).toEqual({ id: 'c-1' });
	});
});
