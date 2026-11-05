import { z } from 'zod';

/**
 * Zod schema for structured AI scoring output.
 * Used with Vercel AI SDK's `generateObject()` for type-safe AI responses.
 */
export const AiScoringResultSchema = z.object({
	matchScore: z
		.number()
		.min(0)
		.max(100)
		.describe('Overall match score from 0 to 100'),
	skillsEvidence: z
		.array(
			z.object({
				required: z.string().describe('Skill required by the job'),
				employee: z.string().describe('Employee\'s matching skill or closest equivalent'),
				match: z.boolean().describe('Whether the skill is a strong match'),
			})
		)
		.describe('Evidence mapping of required skills to employee capabilities'),
	riskFlags: z
		.array(
			z.object({
				flag: z.string().describe('Short risk flag name'),
				severity: z.enum(['low', 'medium', 'high']).describe('Risk severity level'),
				detail: z.string().describe('Detailed explanation of the risk'),
			})
		)
		.describe('Risk flags identified in the match'),
	budgetFit: z
		.enum(['good_fit', 'under_budget', 'over_budget', 'unknown'])
		.describe('How well the job budget aligns with employee rate'),
	recommendedAction: z
		.enum(['apply_now', 'ask_question', 'skip', 'review'])
		.describe('Recommended next action for this match'),
	explanation: z
		.string()
		.describe('Human-readable summary explaining why this job matches or does not match the employee'),
});

/**
 * TypeScript type inferred from the Zod schema.
 */
export type AiScoringResult = z.infer<typeof AiScoringResultSchema>;
