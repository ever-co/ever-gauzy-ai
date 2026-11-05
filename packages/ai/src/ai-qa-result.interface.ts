import { z } from 'zod';

/**
 * Zod schema for structured AI QA answer generation output.
 * Used with Vercel AI SDK's `generateObject()` for type-safe AI responses.
 *
 * When a job posting has screening questions (common on Upwork),
 * this schema structures the AI-generated answers.
 */
export const AiQAResultSchema = z.object({
	answers: z
		.array(
			z.object({
				question: z.string().describe('The original screening question'),
				answer: z
					.string()
					.describe(
						'A professional, concise answer tailored to the employee profile and job context'
					),
			})
		)
		.describe('Array of question-answer pairs'),
});

/**
 * TypeScript type inferred from the Zod schema.
 */
export type AiQAResult = z.infer<typeof AiQAResultSchema>;
