import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { CAPABILITY_PLUGINS, pluginEnabled, type PluginSwitch } from '@packages/plugin/plugin.interface';
import { PluginRegistry } from '@packages/plugin/plugin-registry.service';
import { Novu } from '@novu/api';
import {
	NovuWorkflows,
	NovuWorkflowId,
	NovuSubscriber,
	MatchAlertPayload,
	ApplicationStatusPayload,
	AutomationTaskCompletePayload,
	DailyDigestPayload,
} from './novu.workflows';

/**
 * Novu Notification Service
 *
 * Wraps the @novu/api SDK to send notifications via Novu Cloud.
 * Gracefully degrades if NOVU_API_KEY is not configured.
 *
 * Supported workflows:
 * - `new-job-match`           — AI match alerts (score threshold)
 * - `application-status`      — Application lifecycle updates
 * - `automation-task-complete` — Automation task results
 * - `daily-digest`            — Periodic summary of activity
 */
/** Per-call behaviour of a send. */
export interface NovuSendOptions {
	/** Rethrow a Novu error instead of only logging it (default: log and continue). */
	throwOnError?: boolean;
}

@Injectable()
export class NovuService {
	private readonly logger = new Logger(NovuService.name);
	private novu: Novu | null = null;

	/** `plugins` (the PluginRegistry) lets `GAUZY_AI_PLUGINS_DISABLED=novu` switch notifications off. */
	constructor(@Optional() @Inject(PluginRegistry) private readonly plugins?: PluginSwitch) {
		this.initNovu();
	}

	/**
	 * Initialize Novu client from env vars.
	 * If NOVU_API_KEY is not set, notifications are silently skipped.
	 */
	private initNovu(): void {
		const apiKey = process.env.NOVU_API_KEY;

		if (apiKey) {
			this.novu = new Novu({ secretKey: apiKey });
			this.logger.log('Novu SDK initialized for notifications');
		} else {
			this.logger.warn(
				'NOVU_API_KEY not configured. Notifications will be skipped.'
			);
		}
	}

	/**
	 * Check whether the Novu SDK is initialized and ready to send notifications.
	 */
	public isEnabled(): boolean {
		return this.novu !== null && pluginEnabled(this.plugins, CAPABILITY_PLUGINS.novu);
	}

	// ─── Core Trigger Method ────────────────────────────────────────

	/**
	 * Generic trigger method for any Novu workflow.
	 * All specific notification methods delegate to this.
	 */
	private async trigger(
		workflowId: NovuWorkflowId,
		subscriber: NovuSubscriber,
		payload: Record<string, unknown>,
		options: NovuSendOptions = {},
	): Promise<void> {
		if (!this.isEnabled()) {
			this.logger.debug(`Novu not configured or disabled — skipping ${workflowId} notification`);
			return;
		}

		try {
			await this.novu.trigger({
				workflowId,
				to: {
					subscriberId: subscriber.subscriberId,
					firstName: subscriber.firstName,
					lastName: subscriber.lastName,
					email: subscriber.email,
				},
				payload,
			});

			this.logger.debug(
				`[${workflowId}] Notification sent to subscriber ${subscriber.subscriberId}`
			);
		} catch (error) {
			this.logger.error(
				`[${workflowId}] Failed to send notification: ${error.message}`
			);
			// By default don't throw — notifications should never block the pipeline. Callers that
			// account for outcomes (the daily digest job) ask for the error instead.
			if (options.throwOnError) {
				throw error;
			}
		}
	}

	// ─── Workflow-Specific Methods ──────────────────────────────────

	/**
	 * Send a match alert notification when a job match exceeds the notification threshold.
	 *
	 * Workflow: `new-job-match`
	 *
	 * @param employee - Employee who matched
	 * @param jobPost - The matching job post
	 * @param matchScore - AI match score (0-100)
	 * @param explanation - AI explanation of the match
	 */
	public async sendMatchAlert(
		employee: { id: string; firstName?: string; lastName?: string; userId?: string },
		jobPost: { id: string; title?: string; providerCode?: string },
		matchScore: number,
		explanation: string
	): Promise<void> {
		const payload: MatchAlertPayload = {
			jobTitle: jobPost.title || 'Unknown Job',
			matchScore,
			explanation,
			providerCode: jobPost.providerCode || 'unknown',
			jobPostId: jobPost.id,
			employeeId: employee.id,
		};

		await this.trigger(
			NovuWorkflows.NEW_JOB_MATCH,
			{
				subscriberId: employee.userId || employee.id,
				firstName: employee.firstName,
				lastName: employee.lastName,
			},
			payload as unknown as Record<string, unknown>,
		);
	}

	/**
	 * Send an application status update notification.
	 *
	 * Workflow: `application-status`
	 *
	 * @param employee - Employee whose application status changed
	 * @param payload - Application status payload
	 */
	public async sendApplicationStatus(
		employee: { id: string; firstName?: string; lastName?: string; userId?: string },
		payload: ApplicationStatusPayload
	): Promise<void> {
		await this.trigger(
			NovuWorkflows.APPLICATION_STATUS,
			{
				subscriberId: employee.userId || employee.id,
				firstName: employee.firstName,
				lastName: employee.lastName,
			},
			payload as unknown as Record<string, unknown>,
		);
	}

	/**
	 * Send a notification when an automation task completes or fails.
	 *
	 * Workflow: `automation-task-complete`
	 *
	 * @param employee - Employee who owns the automation task
	 * @param payload - Automation task result payload
	 */
	public async sendAutomationTaskComplete(
		employee: { id: string; firstName?: string; lastName?: string; userId?: string },
		payload: AutomationTaskCompletePayload
	): Promise<void> {
		await this.trigger(
			NovuWorkflows.AUTOMATION_TASK_COMPLETE,
			{
				subscriberId: employee.userId || employee.id,
				firstName: employee.firstName,
				lastName: employee.lastName,
			},
			payload as unknown as Record<string, unknown>,
		);
	}

	/**
	 * Send a daily digest notification summarizing recent activity.
	 *
	 * Workflow: `daily-digest`
	 *
	 * @param employee - Employee to send the digest to
	 * @param payload - Digest summary payload
	 */
	public async sendDailyDigest(
		employee: { id: string; firstName?: string; lastName?: string; userId?: string; email?: string },
		payload: DailyDigestPayload,
		options: NovuSendOptions = {}
	): Promise<void> {
		await this.trigger(
			NovuWorkflows.DAILY_DIGEST,
			{
				subscriberId: employee.userId || employee.id,
				firstName: employee.firstName,
				lastName: employee.lastName,
				email: employee.email,
			},
			payload as unknown as Record<string, unknown>,
			options,
		);
	}
}
