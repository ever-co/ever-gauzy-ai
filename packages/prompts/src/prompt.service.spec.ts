const getPrompt = jest.fn();
jest.mock('langfuse', () => ({
	Langfuse: jest.fn().mockImplementation(() => ({ getPrompt, shutdownAsync: jest.fn() })),
}));

import { PROMPT_NAMES, catalogPrompt, compileTemplate } from './catalog';
import { PromptService } from './prompt.service';

const config = (keys: boolean): any => ({
	langfusePublicKey: () => (keys ? 'pk' : ''),
	langfuseSecretKey: () => (keys ? 'sk' : ''),
	langfuseHost: () => 'https://langfuse.example.com',
});

describe('PromptService (Langfuse registry with the built-in catalog as fallback)', () => {
	beforeEach(() => getPrompt.mockReset()); // not resetAllMocks: that would also wipe the Langfuse constructor mock

	it('fills variables in a catalog prompt ({{name}} syntax) and leaves unknown placeholders alone', () => {
		expect(compileTemplate('Hi {{ name }}, {{missing}}', { name: 'Ann' })).toBe('Hi Ann, {{missing}}');
	});

	it('uses the catalog when Langfuse is not configured', async () => {
		const service = new PromptService(config(false));
		expect(service.isLangfuseEnabled()).toBe(false);
		const prompt = await service.get(PROMPT_NAMES.jobProposal, { existingTemplate: 'MY TEMPLATE', jobDetails: 'THE JOB' });
		expect(prompt.source).toBe('catalog');
		expect(prompt.text).toContain('MY TEMPLATE');
		expect(prompt.text).toContain('THE JOB');
		expect(prompt.text).not.toContain('{{');
		expect(getPrompt).not.toHaveBeenCalled();
	});

	it('serves the Langfuse version when configured, with the telemetry link', async () => {
		getPrompt.mockResolvedValue({
			version: 4,
			compile: (vars: Record<string, string>) => `from langfuse: ${vars.jobDetails}`,
			toJSON: () => JSON.stringify({ name: PROMPT_NAMES.jobProposal, version: 4 }), // the SDK serializes
		});
		const service = new PromptService(config(true));
		expect(service.isLangfuseEnabled()).toBe(true);
		const prompt = await service.get(PROMPT_NAMES.jobProposal, { existingTemplate: 't', jobDetails: 'j' });
		expect(prompt).toEqual({
			name: PROMPT_NAMES.jobProposal,
			text: 'from langfuse: j',
			source: 'langfuse',
			version: 4,
			langfusePrompt: JSON.stringify({ name: PROMPT_NAMES.jobProposal, version: 4 }),
		});
		expect(getPrompt).toHaveBeenCalledWith(PROMPT_NAMES.jobProposal);
	});

	it('stays in catalog mode when the langfuse plugin is switched off, keys or not', async () => {
		const service = new PromptService(config(true), { isEnabled: () => false });
		expect(service.isLangfuseEnabled()).toBe(false);
		const prompt = await service.get(PROMPT_NAMES.jobMatchScoring);
		expect(prompt.source).toBe('catalog');
		expect(getPrompt).not.toHaveBeenCalled();
	});

	it('falls back to the catalog when Langfuse fails or lacks the prompt, and refuses unknown names', async () => {
		getPrompt.mockRejectedValue(new Error('404 prompt not found'));
		const service = new PromptService(config(true));
		const prompt = await service.get(PROMPT_NAMES.jobMatchScoring);
		expect(prompt.source).toBe('catalog');
		expect(prompt.text).toBe(catalogPrompt(PROMPT_NAMES.jobMatchScoring)!.prompt);
		await expect(service.get('no-such-prompt')).rejects.toThrow(/Unknown prompt/);
	});
});
