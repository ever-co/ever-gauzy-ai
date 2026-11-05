import type { ResolvedPrompt } from './prompt.service';

/**
 * AI SDK telemetry settings for a call that uses `prompt`: the function id names the call in
 * traces, and a Langfuse prompt reference links the generation to the prompt version it ran with.
 */
export function promptTelemetry(functionId: string, prompt: ResolvedPrompt) {
	return {
		isEnabled: true,
		functionId,
		...(prompt.langfusePrompt ? { metadata: { langfusePrompt: prompt.langfusePrompt } } : {}),
	};
}
