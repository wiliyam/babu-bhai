import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Settings, settingsSchema } from "./schema.js";

export function loadSettings(): Settings {
  // Load .env file if present
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = Bun.file(envPath).text();
    // Bun auto-loads .env, but we log it
  }

  const raw = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
    approvedDirectory: process.env.APPROVED_DIRECTORY,
    allowedUsers: process.env.ALLOWED_USERS,
    cavemanMode: process.env.CAVEMAN_MODE,
    claudeModel: process.env.CLAUDE_MODEL,
    claudeMaxTurns: process.env.CLAUDE_MAX_TURNS,
    claudeTimeoutSeconds: process.env.CLAUDE_TIMEOUT_SECONDS,
    agenticMode: process.env.AGENTIC_MODE,
    logLevel: process.env.LOG_LEVEL,
    rateLimitRequests: process.env.RATE_LIMIT_REQUESTS,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    enableScheduler: process.env.ENABLE_SCHEDULER,
    enableMemory: process.env.ENABLE_MEMORY,
    memoryDir: process.env.MEMORY_DIR,
    soulPath: process.env.SOUL_PATH,
    identityPath: process.env.IDENTITY_PATH,
  };

  const result = settingsSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}
