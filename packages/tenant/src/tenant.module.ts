import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import { Tenant } from '@packages/entities';
import { TenantDTO } from './tenant.dto';
import { TenantResolver } from './resolvers/tenant.resolver';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Tenant
        ]),
        NestjsQueryGraphQLModule.forFeature({
            imports: [
                NestjsQueryTypeOrmModule.forFeature([
                    Tenant
                ])
            ],
            resolvers: [
                {
                    DTOClass: TenantDTO,
                    EntityClass: Tenant,
                    create: {
                        disabled: true
                    },
                    read: {
                        disabled: false
                    },
                    update: {
                        disabled: true
                    },
                    delete: {
                        disabled: true
                    }
                },
            ],
        }),
    ],
    controllers: [],
    providers: [TenantResolver],
    exports: [],
})
export class TenantModule { }
