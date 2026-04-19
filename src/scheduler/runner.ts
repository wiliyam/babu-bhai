/**
 * Scheduled job runner with session isolation.
 * Jobs run in fresh Claude sessions — no pollution of user's interactive conversation.
 */
import { Cron } from "croner";
import type { Bot } from "grammy";
import { nanoid } from "nanoid";
import type { ClaudeIntegration } from "../claude/facade.js";
import type { AuditRepository, JobRepository } from "../storage/repositories.js";
import type { ScheduledJob } from "../storage/models.js";
import { APP_NAME, TELEGRAM_MAX_MESSAGE_LENGTH } from "../utils/constants.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("scheduler");

export interface SchedulerDeps {
  jobs: JobRepository;
  audit: AuditRepository;
  claude: ClaudeIntegration;
  approvedDirectory: string;
  systemPrompt: string;
}

export interface CreateJobInput {
  name: string;
  cronExpression: string;
  prompt: string;
  userId: number;
  chatId: number;
  timezone?: string;
}

export class Scheduler {
  private crons = new Map<string, Cron>();
  private bot: Bot | null = null;

  constructor(private deps: SchedulerDeps) {}

  /** Attach bot and start all active jobs. Call after bot construction. */
  start(bot: Bot): void {
    this.bot = bot;
    const active = this.deps.jobs.findActive();
    for (const job of active) {
      this.register(job);
    }
    log.info({ count: active.length }, "Scheduler started");
  }

  stop(): void {
    for (const cron of this.crons.values()) {
      cron.stop();
    }
    this.crons.clear();
    log.info("Scheduler stopped");
  }

  create(input: CreateJobInput): ScheduledJob {
    const id = nanoid(12);
    const job: ScheduledJob = {
      id,
      name: input.name,
      cronExpression: input.cronExpression,
      prompt: input.prompt,
      userId: input.userId,
      chatId: input.chatId,
      timezone: input.timezone ?? "UTC",
      isActive: true,
      lastRun: null,
      nextRun: null,
      runCount: 0,
      createdAt: new Date().toISOString(),
    };

    // Validate cron expression
    try {
      new Cron(input.cronExpression, { timezone: job.timezone });
    } catch (err) {
      throw new Error(`Invalid cron: ${err instanceof Error ? err.message : err}`);
    }

    this.deps.jobs.create(job);
    this.register(job);
    this.deps.audit.log(input.userId, "scheduler:create", `${id}:${input.name}`);
    return job;
  }

  list(userId: number): ScheduledJob[] {
    return this.deps.jobs.findActive().filter((j) => j.userId === userId);
  }

  cancel(userId: number, id: string): boolean {
    const job = this.deps.jobs.findActive().find((j) => j.id === id && j.userId === userId);
    if (!job) return false;

    this.deps.jobs.deactivate(id);
    this.crons.get(id)?.stop();
    this.crons.delete(id);
    this.deps.audit.log(userId, "scheduler:cancel", id);
    return true;
  }

  private register(job: ScheduledJob): void {
    const cron = new Cron(
      job.cronExpression,
      { timezone: job.timezone, protect: true },
      () => this.runJob(job),
    );
    this.crons.set(job.id, cron);
    log.info({ id: job.id, name: job.name, cron: job.cronExpression }, "Registered job");
  }

  private async runJob(job: ScheduledJob): Promise<void> {
    log.info({ id: job.id, name: job.name }, "Running scheduled job");

    try {
      // Isolated session — reset before each run
      this.deps.claude.resetSession(job.userId, this.deps.approvedDirectory);

      const response = await this.deps.claude.runCommand(
        job.prompt,
        job.userId,
        this.deps.approvedDirectory,
        { systemPrompt: this.deps.systemPrompt },
      );

      const header = `🕒 *${escMd(job.name)}*\n\n`;
      const body = response.content?.trim() || "(no output)";
      const chunks = chunkText(header + body, TELEGRAM_MAX_MESSAGE_LENGTH);

      for (const chunk of chunks) {
        await this.bot?.api.sendMessage(job.chatId, chunk, { parse_mode: "Markdown" })
          .catch(() => this.bot?.api.sendMessage(job.chatId, chunk));
      }

      this.deps.jobs.updateLastRun(job.id);
      this.deps.audit.log(job.userId, "scheduler:run", job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ id: job.id, error: msg }, "Job failed");
      await this.bot?.api.sendMessage(
        job.chatId,
        `🕒 *${escMd(job.name)}* failed\n\n${msg.slice(0, 500)}`,
      ).catch(() => {});
    }
  }
}

function escMd(t: string): string {
  return t.replace(/([*_`\[])/g, "\\$1");
}

function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let at = remaining.lastIndexOf("\n\n", limit);
    if (at < limit / 2) at = remaining.lastIndexOf("\n", limit);
    if (at < limit / 2) at = limit;
    chunks.push(remaining.slice(0, at));
    remaining = remaining.slice(at).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
