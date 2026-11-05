import { NestModule, MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '@packages/user/user.module';
import { AuthMiddleware } from './auth.middleware';
import { AuthGuard } from './auth.guard';
import { ServiceTokenGuard } from './service-token.guard';
import { TenantApiKeyService } from './tenant-api-key.service';
import { TenantAuthService } from './auth.service';
import { EverIdService } from './ever-id.service';
import { TenantApiKey } from '@packages/entities';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			TenantApiKey
		]),
		UserModule
	],
	controllers: [],
	providers: [
		AuthMiddleware,
		TenantApiKeyService,
		TenantAuthService,
		EverIdService,
		ServiceTokenGuard,
		// Every route and resolver requires an authenticated tenant unless marked @Public().
		{ provide: APP_GUARD, useClass: AuthGuard },
	],
	exports: [TypeOrmModule, TenantApiKeyService, TenantAuthService, EverIdService, ServiceTokenGuard],
})
export class AuthModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer.apply(AuthMiddleware).forRoutes('*');
	}
}
