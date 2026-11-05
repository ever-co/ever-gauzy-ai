// Copyright (c) 2019-2020 Ever Co. LTD
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor, RequestContextMiddleware } from './context';

@Module({
    imports: [],
    controllers: [],
    // GraphQL operations over WebSocket skip the middleware: the interceptor gives them a RequestContext.
    providers: [{ provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor }]
})
export class CoreModule implements NestModule {
    /**
     * 
     * @param consumer 
     */
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(RequestContextMiddleware).forRoutes('*');
    }
}
