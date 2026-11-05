import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@packages/core/decorators/public.decorator';
import { ServiceTokenGuard } from '@packages/auth/service-token.guard';
import { PluginRegistry } from './plugin-registry.service';

/** Which plugins this deployment runs, with their state (operators and integrators; service token or tenant credential). */
@ApiTags('plugins')
@Controller('api/plugins')
@Public()
@UseGuards(ServiceTokenGuard)
export class PluginsController {
	constructor(private readonly registry: PluginRegistry) {}

	@Get()
	@ApiOperation({ summary: 'The plugins of this deployment and whether each is enabled' })
	list() {
		return this.registry.list();
	}
}
