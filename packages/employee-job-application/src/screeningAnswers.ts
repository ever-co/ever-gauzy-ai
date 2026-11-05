type QaItem = Record<string, unknown>;

/** A JSON array of question / answer objects, or undefined for anything else. */
const parseQa = (json: string | null | undefined): QaItem[] | undefined => {
	if (!json) {
		return undefined;
	}
	try {
		const value: unknown = JSON.parse(json);
		return Array.isArray(value) ? value.filter((item): item is QaItem => !!item && typeof item === 'object') : undefined;
	} catch {
		return undefined;
	}
};

/** Question / answer of an item in either shape: the clients' `{ q, a }` or the AI's `{ question, answer }`. */
const questionOf = (item: QaItem): string => {
	const question = item.q ?? item.question;
	return typeof question === 'string' ? question.trim().toLowerCase() : '';
};
const answerOf = (item: QaItem): string | undefined => {
	const answer = item.a ?? item.answer;
	return typeof answer === 'string' && answer.trim() ? answer : undefined;
};

/**
 * The screening answers to store on an application (and send with its automation task): the
 * questions as the caller supplied them, each answer the caller gave kept, and the AI answer
 * filled in where the caller left one blank (matched by question text, else by position when the
 * AI answer at that position is not for another of the caller's questions), in the caller's own
 * shape. A question the AI did not answer stays blank. Without supplied questions the AI answers are used as they are; supplied QA
 * that is not a JSON array, or that the AI could not complete, is kept unchanged.
 */
export function completeScreeningAnswers(supplied: string | null | undefined, generated: string | null | undefined): string | undefined {
	if (!supplied) {
		return generated || undefined;
	}
	const questions = parseQa(supplied);
	const answers = parseQa(generated);
	if (!questions || !answers?.length) {
		return supplied;
	}
	let filled = false;
	const suppliedQuestions = new Set(questions.map(questionOf).filter((question) => question !== ''));
	const completed = questions.map((item, index) => {
		if (answerOf(item)) {
			return item;
		}
		const byQuestion = answers.find((candidate) => questionOf(candidate) !== '' && questionOf(candidate) === questionOf(item));
		// by position only an answer that is not another supplied question's
		const byPosition = answers[index] && !suppliedQuestions.has(questionOf(answers[index])) ? answers[index] : undefined;
		const match = byQuestion ?? byPosition;
		const answer = match && answerOf(match);
		if (!answer) {
			return item;
		}
		filled = true;
		return { ...item, ['answer' in item || 'question' in item ? 'answer' : 'a']: answer };
	});
	return filled ? JSON.stringify(completed) : supplied;
}

/** How many screening questions in `qa` (a JSON array of question / answer objects) have no answer. */
export const unansweredScreeningQuestions = (qa: string | null | undefined): number =>
	parseQa(qa)?.filter((item) => questionOf(item) !== '' && !answerOf(item)).length ?? 0;
