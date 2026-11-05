export enum AuthMethod {
	ApiKey = 'ApiKey', // Represents ApiKey / ApiSecret Pair Based Authorization
	BearerToken = 'BearerToken', // Represents BearerToken / TenantId Pair Based Authorization (legacy tenant JWT)
	EverId = 'EverId', // Ever ID (OpenID Connect) user token verified against the issuer's keys
	ServiceToken = 'ServiceToken', // Internal service token (X-SERVICE-TOKEN) for tenant-less scheduler calls
}