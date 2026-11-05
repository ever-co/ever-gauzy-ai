import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NestjsQueryGraphQLModule } from '@ptc-org/nestjs-query-graphql';
import { NestjsQueryTypeOrmModule } from '@ptc-org/nestjs-query-typeorm';
import config from '@packages/config';
import { UserDTO } from '@packages/dto/user.dto';
import { User } from '@packages/entities';
import { UserResolver } from './resolvers/user.resolver';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [config],
        }),
        TypeOrmModule.forFeature([
            User
        ]),
        NestjsQueryGraphQLModule.forFeature({
            imports: [
                NestjsQueryTypeOrmModule.forFeature([
                    User
                ])
            ],
            resolvers: [
                {
                    DTOClass: UserDTO,
                    EntityClass: User,
                    enableSubscriptions: true,
                    delete: {
                        disabled: false
                    }
                },
            ],
        }),
    ],
    controllers: [UserController],
    providers: [UserService, UserResolver],
    exports: [UserService],
})
export class UserModule { }
