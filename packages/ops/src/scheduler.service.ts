import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigurationService, JobName } from '@packages/config';
import { CrawlerService } from '@packages/crawler/crawler.service';
import { OpsService } from './ops.service';

export interface ScheduledJob {
	name: JobName;
	cron: string;
	run: () => Promise<unknown>;
}

/**
 * In-process scheduler (node-cron through @nestjs/schedule). It runs the platform's periodic jobs
 * when nothing else does: on unless `LOCAL_CRON_ENABLED=false`, and off by default when Trigger.dev
 * is enabled, whose tasks (src/trigger) run the same jobs by calling `/api/ops/*` and `/api/crawler/*`.
 * A job never overlaps itself: a tick that arrives while the previous run is still going is skipped.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
	private readonly logger = new Logger(SchedulerService.name);
	private readonly running = new Set<string>();

	constructor(
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly configurationService: ConfigurationService,
		private readonly crawlerService: CrawlerService,
		private readonly opsService: OpsService,
		@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch
	) {}

	/** The periodic jobs with their schedules (resolved by ConfigurationService.schedules, the same for the Trigger.dev tasks). */
	public jobs(): ScheduledJob[] {
		const config = this.configurationService;
		const runners: Record<JobName, () => Promise<unknown>> = {
			crawl: () => this.crawlerService.crawl(),
			'liveness-check': () => this.crawlerService.runLivenessChecks(),
			'score-pending-matches': () => this.opsService.scorePendingMatches(config.scorePendingLimit()),
			'daily-digest': () => this.opsService.sendDailyDigest(),
			'cleanup-stale-tasks': () => this.opsService.cleanupStaleTasks(),
		};
		return config.schedules().map(({ name, cron }) => ({ name, cron, run: runners[name] }));
	}

	/**
	 * The configured rule (LOCAL_CRON_ENABLED, else on unless Trigger.dev is enabled) — except that a
	 * switched-off `trigger-dev` plugin means Trigger.dev is not running the jobs, so without an
	 * explicit LOCAL_CRON_ENABLED the in-process scheduler takes over.
	 */
	public isEnabled(): boolean {
		const explicit = process.env.LOCAL_CRON_ENABLED;
		if (explicit !== 'true' && explicit !== 'false' && !pluginEnabled(this.plugins, CAPABILITY_PLUGINS.triggerDev)) {
			return true;
		}
		return this.configurationService.localCronEnabled();
	}

	onModuleInit(): void {
		if (!this.isEnabled()) {
			this.logger.log(
				'In-process cron is off (LOCAL_CRON_ENABLED=false or Trigger.dev enabled): the periodic jobs are expected from Trigger.dev tasks or callers of /api/ops'
			);
			return;
		}
		for (const job of this.jobs()) {
			this.register(job);
		}
	}

	/** Runs one job now unless it is already running; a failing run is logged and never stops the schedule. */
	public async runJob(job: ScheduledJob): Promise<void> {
		if (this.running.has(job.name)) {
			this.logger.warn(`[cron] ${job.name} skipped: the previous run is still going`);
			return;
		}
		this.running.add(job.name);
		this.logger.log(`[cron] ${job.name} started`);
		try {
			const result = await job.run();
			this.logger.log(`[cron] ${job.name} finished${result ? ' ' + JSON.stringify(result) : ''}`);
		} catch (error) {
			this.logger.error(`[cron] ${job.name} failed: ${error.message}`);
		} finally {
			this.running.delete(job.name);
		}
	}

	/** Registers and starts one job. */
	public register(job: ScheduledJob): CronJob {
		const timezone = this.configurationService.schedulerTimezone();
		const cronJob = CronJob.from({
			cronTime: job.cron,
			onTick: () => this.runJob(job),
			start: false,
			timeZone: timezone,
			// the cron library itself also holds the next tick until an async run has completed
			waitForCompletion: true,
		});
		this.schedulerRegistry.addCronJob(job.name, cronJob);
		cronJob.start();
		this.logger.log(`[cron] ${job.name} scheduled (${job.cron}${timezone ? ' ' + timezone : ''})`);
		return cronJob;
	}
}
