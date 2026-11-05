import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { TenantAwareCrudService } from '@packages/core/crud';
import { User } from '@packages/entities';

// Service responsible to register (and decommission) users in the Gauzy AI system
@Injectable()
export class UserService extends TenantAwareCrudService<User> {
    constructor(
        @InjectRepository(User)
        protected readonly repo: Repository<User>
    ) {
        super(repo);
    }

    /**
     * Active users (with an active tenant) that own a verified e-mail. The comparison is
     * case-insensitive on both sides (stored e-mails keep the case they were registered with).
     * Never queries with an empty e-mail: an undefined `where` value would be dropped and match
     * every user.
     */
    async findActiveByEmail(email: string): Promise<User[]> {
        const normalised = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!normalised) {
            return [];
        }
        return await this.repo.find({
            where: {
                email: Raw((column) => `LOWER(${column}) = :email`, { email: normalised }),
                isActive: true,
                isArchived: false,
                tenant: { isActive: true, isArchived: false },
            },
            relations: { tenant: true },
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Find a TenantApiKey based on the provided API key.
     * @param apiKey The API key to search for.
     * @returns A Promise that resolves to a TenantApiKey or null if not found.
     */
    async findUserByExternalOptions({ externalUserId, externalEmployeeId, externalTenantId }): Promise<User | null> {
        try {
            const user = await this.repo.findOne({
                where: {
                    externalUserId,
                    externalTenantId,
                    isActive: true,
                    isArchived: false,
                    // Also Filter by Employee's isActive & isArchived flag
                    employee: {
                        externalEmployeeId,
                        externalTenantId,
                        isActive: true, // Filter by related Tenant's isActive being true
                        isArchived: false, // Filter by related Tenant's isArchived being false
                    },
                    // Also Filter by Tenant's isActive & isArchived flag
                    tenant: {
                        isActive: true, // Filter by related Tenant's isActive being true
                        isArchived: false, // Filter by related Tenant's isArchived being false,
                        externalTenantId
                    },
                },
                relations: {
                    tenant: true
                }
            });
            return user || null;
        } catch (error) {
            // Handle any errors that may occur during the database query
            console.error('Error fetching user:', error.message);
            return null;
        }
    }
}
