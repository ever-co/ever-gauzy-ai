import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TriggerService } from './trigger.service';
import config, { ConfigurationService } from '@packages/config';

/**
 * Trigger.dev integration: configures the SDK when `TRIGGER_DEV_ENABLED=true` so the API can
 * trigger event tasks. The tasks themselves (src/trigger) run on Trigger.dev workers; when
 * disabled, the in-process SchedulerService (packages/ops) runs the periodic jobs.
 */
@Module({
	imports: [ConfigModule.forRoot({ load: [config] })],
	providers: [ConfigurationService, TriggerService],
	exports: [TriggerService],
})
export class TriggerModule {}
