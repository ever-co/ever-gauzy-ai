import { completeScreeningAnswers } from './screeningAnswers';

describe('completeScreeningAnswers', () => {
	const ai = '[{"question":"Availability?","answer":"Full time"},{"question":"Rate?","answer":"40"}]';

	it('uses the AI answers as they are when the caller sent no questions', () => {
		expect(completeScreeningAnswers(undefined, ai)).toBe(ai);
		expect(completeScreeningAnswers(null, undefined)).toBeUndefined();
	});

	it('keeps the caller answers and fills the blank ones, matched by question then by position', () => {
		expect(completeScreeningAnswers('[{"q":"Rate?","a":"50"},{"q":"availability?"}]', ai)).toBe(
			'[{"q":"Rate?","a":"50"},{"q":"availability?","a":"Full time"}]'
		);
		expect(completeScreeningAnswers('[{"question":"Start date?","answer":""}]', '[{"question":"When can you start?","answer":"Monday"}]')).toBe(
			'[{"question":"Start date?","answer":"Monday"}]'
		);
	});

	it('never takes by position an answer that belongs to another supplied question', () => {
		// the AI answered only "Rate?": "Availability?" stays blank (and the application is not ready)
		expect(completeScreeningAnswers('[{"q":"Availability?","a":""},{"q":"Rate?","a":""}]', '[{"question":"Rate?","answer":"40"}]')).toBe(
			'[{"q":"Availability?","a":""},{"q":"Rate?","a":"40"}]'
		);
	});

	it('returns the supplied QA unchanged when nothing is filled or it is not a JSON array', () => {
		const answered = '[ {"q":"Rate?","a":"50"} ]';
		expect(completeScreeningAnswers(answered, ai)).toBe(answered);
		expect(completeScreeningAnswers('{}', ai)).toBe('{}');
		expect(completeScreeningAnswers('[{"q":"Rate?"}]', 'not json')).toBe('[{"q":"Rate?"}]');
	});
});
