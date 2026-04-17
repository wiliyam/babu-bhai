import { z } from "zod";

export const settingsSchema = z.object({
  // Telegram
  telegramBotToken: z.string().min(1),
  telegramBotUsername: z.string().min(1),

  // Directory — NO default, must be explicitly set
  approvedDirectory: z.string().min(1),

  // Auth — REQUIRED, no open-to-all default
  allowedUsers: z
    .string()
    .min(1, "ALLOWED_USERS is required. Set at least one Telegram user ID.")
    .transform((v) => v.split(",").map((id) => Number(id.trim())).filter((id) => !Number.isNaN(id) && id > 0)),

  // Caveman mode for token savings
  cavemanMode: z.enum(["off", "lite", "full", "ultra"]).default("full"),

  // Claude
  claudeModel: z.string().default("default"),
  claudeMaxTurns: z.coerce.number().default(10),
  claudeTimeoutSeconds: z.coerce.number().default(300),

  // Features
  agenticMode: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Rate limiting
  rateLimitRequests: z.coerce.number().default(10),
  rateLimitWindowMs: z.coerce.number().default(60_000),

  // Scheduler
  enableScheduler: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // Memory
  enableMemory: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  memoryDir: z.string().default("./memory"),

  // Identity
  soulPath: z.string().optional(),
  identityPath: z.string().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;
