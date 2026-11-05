/**
 * This is request object which will be send to AI service to generate proposal
 */
export class GenerateProposalRequest {
	public title: string;
	public description: string;
	public skills: string;
	public category: string;
	public employeeTemplate: string;
	public qa: string;
}
