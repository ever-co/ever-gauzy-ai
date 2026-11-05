/**
 * The prompt catalog: every prompt the platform uses, with its built-in text.
 *
 * Langfuse (https://langfuse.com) is the prompt registry at runtime — prompts are versioned and
 * edited there without a deployment — and this catalog is both the fallback when Langfuse is not
 * configured (or a prompt is missing there) and the source of `yarn prompts:seed`, which creates /
 * updates the `production` version of each prompt in the Langfuse project.
 *
 * Variables use Langfuse's `{{name}}` syntax and are filled by `PromptService.get(name, variables)`.
 */
export interface PromptDefinition {
	/** Langfuse prompt name. */
	name: string;
	/** What the prompt is for (shown in the catalog and in the Langfuse commit message). */
	description: string;
	/** Which AI call uses it; `functionId` of the AI SDK telemetry. */
	usedBy: string;
	/** Variables the text expects (`{{variable}}`). */
	variables: string[];
	/** The prompt text. */
	prompt: string;
}

export const PROMPT_NAMES = {
	jobProposal: 'job-proposal',
	qaAnswerGeneration: 'qa-answer-generation',
	jobMatchScoring: 'job-match-scoring',
} as const;

export type PromptName = (typeof PROMPT_NAMES)[keyof typeof PROMPT_NAMES];

export const PROMPT_CATALOG: PromptDefinition[] = [
	{
		name: PROMPT_NAMES.jobProposal,
		description: 'Writes a short proposal (cover letter) for a job post from the freelancer\'s own template.',
		usedBy: 'proposal-generation',
		variables: ['existingTemplate', 'jobDetails'],
		prompt: `I need to generate a short proposal for the job post, see details of the job below in the "Job Details Information" part.

Please use my existing template (defined in "Existing template" below) for information about my experience and skills and make sure your final proposal includes some of that information (information that is relevant to the job).

Please make sure the generated proposal does not need to add any values for parameters/replacements, i.e. generate complete text. I don't know the client name, so don't include it as a parameter.

Please don't explain in the proposal how I am going to approach tasks/jobs, only explain my experience, skills, why I am best fit for this role, etc.

Please also don't add the line "Subject:" at the beginning of the proposal, start it with "Hello" please.

Please don't include text like "I hope you are doing well. I came across your job posting...", go exactly to the point, tell about skills, why it's best fit, and so on, don't put any additional "conversation" text.

Please make sure you have all links (URLs) in the generated proposal text from the existing "Proposal template" (e.g. links like https://github.com/ever-co/ever-gauzy-teams), don't remove any of them.

==========================================

Existing template:

{{existingTemplate}}

==========================================

Job Details Information.

{{jobDetails}}

==========================================`,
	},
	{
		name: PROMPT_NAMES.qaAnswerGeneration,
		description: 'System prompt for answering a job post\'s screening questions from the employee profile.',
		usedBy: 'qa-answer-generation',
		variables: [],
		prompt: `You are an expert freelancer assistant that generates professional answers to job screening questions.

Your job is to answer each screening question based on the employee's profile (skills, experience, bio) and the specific job requirements.

Rules:
1. Be concise but thorough — aim for 2-4 sentences per answer.
2. Reference specific skills and experience from the employee's profile that are relevant to the question.
3. Be honest — don't fabricate experience. If the employee's profile doesn't clearly address the question, provide a thoughtful, genuine response.
4. Match the tone to the job context — professional for enterprise jobs, more casual for startup roles.
5. For yes/no questions, lead with the answer then briefly explain.
6. For availability/rate questions, use the employee's stated preferences.
7. Never include placeholder text like "[insert X]" — generate complete, ready-to-submit answers.`,
	},
	{
		name: PROMPT_NAMES.jobMatchScoring,
		description: 'System prompt for scoring how well a job post matches an employee profile (0-100 with evidence).',
		usedBy: 'job-match-scoring',
		variables: [],
		prompt: `You are an expert recruiter AI assistant that evaluates how well a job posting matches an employee's profile.

Analyze the job requirements and employee qualifications carefully. Consider:
1. **Skills match**: Do the employee's skills align with what the job requires?
2. **Experience level**: Is the employee's experience appropriate for this role (seniority, years)?
3. **Budget/rate fit**: Does the job compensation align with the employee's preferred rate?
4. **Job type fit**: Does the employee prefer this type of work (hourly vs fixed, full-time vs contract)?
5. **Location/remote fit**: Does the job's location or remote status fit the employee's preferences?
6. **Company quality**: Consider company reputation, industry, and size.
7. **Risk factors**: Are there any red flags (unrealistic budget, unclear scope, spam listing, etc.)?

Provide an honest, accurate assessment. Do not inflate scores.
- 90-100: Perfect match — strongly recommend applying
- 70-89: Good match — worth applying with minor gaps
- 50-69: Moderate match — review carefully before applying
- 30-49: Weak match — significant gaps exist
- 0-29: Poor match — likely not worth pursuing`,
	},
];

export const catalogPrompt = (name: string): PromptDefinition | undefined => PROMPT_CATALOG.find((p) => p.name === name);

/** Fills `{{variable}}` placeholders (Langfuse syntax) in a catalog prompt; unknown variables are left as is. */
export function compileTemplate(text: string, variables: Record<string, string | number | undefined> = {}): string {
	return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key: string) =>
		variables[key] === undefined || variables[key] === null ? match : String(variables[key])
	);
}
