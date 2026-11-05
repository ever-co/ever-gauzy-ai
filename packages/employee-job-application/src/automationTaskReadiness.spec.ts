import { automationTaskBlockers } from './automationTaskReadiness';

describe('automationTaskBlockers', () => {
	const ready = { proposal: 'Hello', qa: '[{"q":"Availability?","a":"Full time"}]', providerCode: 'upwork', providerJobId: '~01abc' };

	it('is empty for an application the automation can act on', () => {
		expect(automationTaskBlockers(ready)).toEqual([]);
		expect(automationTaskBlockers({ ...ready, qa: undefined })).toEqual([]);
		expect(automationTaskBlockers({ ...ready, qa: '{}' })).toEqual([]); // no screening questions
	});

	it('lists every missing piece', () => {
		expect(
			automationTaskBlockers({
				proposal: '  ',
				qa: '[{"q":"Availability?","a":""},{"question":"Rate?"},{"q":"Start?","a":"Monday"}]',
				providerCode: '',
				providerJobId: '00000000-0000-0000-0000-000000000000',
			})
		).toEqual([
			'no proposal: write one or generate it (generate-proposal), then submit again',
			'2 screening question(s) without an answer',
			'no providerCode: the job platform is not known',
			'no providerJobId: the job cannot be opened on the platform',
		]);
	});
});
