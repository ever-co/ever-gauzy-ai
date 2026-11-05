import { ITenant } from "./tenant.interface";

// Common properties for entities
export interface IBaseEntityModel {
    id?: string; // Unique identifier

    readonly createdAt?: Date; // When record was created in our DB
    readonly updatedAt?: Date; // When record was updated in our DB

    isActive?: boolean; // Indicates if record is active now
    isArchived?: boolean; // Indicate if record is archived
}

// Common properties for entities associated with a tenant
export interface IBasePerTenantEntityModel extends IBaseEntityModel {
    tenantId?: string; // Identifier of the associated tenant
    tenant?: ITenant; // Reference to the associated tenant
}