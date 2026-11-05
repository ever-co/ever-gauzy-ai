import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import { TenantApiKey } from '@packages/entities';
import { TenantApiKeyDTO } from './tenantApiKey.dto';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TenantApiKey
        ]),
        NestjsQueryGraphQLModule.forFeature({
            imports: [
                NestjsQueryTypeOrmModule.forFeature([
                    TenantApiKey
                ])
            ],
            resolvers: [
                {
                    DTOClass: TenantApiKeyDTO,
                    EntityClass: TenantApiKey,
                    create: {
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
    providers: [],
    exports: [],
})
export class TenantApiKeyModule { }
