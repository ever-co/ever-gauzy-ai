import { IBaseEntityModel } from "./base-entity.model";

export interface ITenant extends IBaseEntityModel {
	name: string;
	logo: string;
	externalTenantId: string;
}

export interface ITenantApiKey {
	apiKey: string;
	apiSecret: string;
	openAiSecretKey?: string;
	openAiOrganizationId?: string;
}
