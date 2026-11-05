/**
 * Trigger.dev tasks (discovered through `dirs` in trigger.config.ts; `yarn trigger:dev` /
 * `yarn trigger:deploy`). They run on Trigger.dev workers, outside the NestJS process, and call
 * back into the API (see api-client.ts). Each scheduled task declares its cron; the in-process
 * SchedulerService (packages/ops) runs the same jobs with node-cron when Trigger.dev is disabled.
 *
 * | Task                | Type      | Calls                                                    | Default schedule |
 * | ------------------- | --------- | -------------------------------------------------------- | ---------------- |
 * | crawl-jobs          | scheduled | POST /api/crawler/crawl                                  | every 10 min     |
 * | liveness-check      | scheduled | POST /api/crawler/liveness                               | hourly           |
 * | daily-digest        | scheduled | POST /api/ops/digest                                     | 08:00            |
 * | cleanup-stale-tasks | scheduled | POST /api/ops/cleanup-stale-tasks                        | 02:00            |
 * | score-pending-matches | scheduled | POST /api/ops/score                                    | hourly (:15)     |
 * | score-matches       | event     | POST /api/ops/score                                      | on demand        |
 * | process-application | event     | POST /api/employee/job/application/process (tenant key)  | on demand        |
 */
export { crawlJobsTask, livenessCheckTask } from './crawl-jobs';
export { dailyDigestTask, cleanupStaleTasksTask } from './daily-digest';
export { scorePendingMatchesTask, scoreMatchesTask, processApplicationTask } from './ai-scoring';
