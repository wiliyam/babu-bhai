import { Bot } from "grammy";
import type { Settings } from "../config/schema.js";
import type { ClaudeIntegration } from "../claude/facade.js";
import type { MemoryStore } from "../memory/store.js";
import type { AuditRepository, UserRepository } from "../storage/repositories.js";
import { createChildLogger } from "../utils/logger.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createRateLimitMiddleware } from "./middleware/rateLimit.js";
import { type CommandDeps, registerCommands } from "./handlers/command.js";
import { type MessageDeps, createMessageHandler } from "./handlers/message.js";
import type { AuthManager } from "../security/auth.js";

const log = createChildLogger("bot");

export interface BotDeps {
  settings: Settings;
  auth: AuthManager;
  claude: ClaudeIntegration;
  memory: MemoryStore | null;
  users: UserRepository;
  audit: AuditRepository;
  systemPrompt: string;
  cavemanMode: string;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.settings.telegramBotToken);

  // Middleware chain (order matters)
  bot.use(createAuthMiddleware(deps.auth));
  bot.use(
    createRateLimitMiddleware(
      deps.settings.rateLimitRequests,
      deps.settings.rateLimitWindowMs,
    ),
  );

  // Register commands
  const commandDeps: CommandDeps = {
    claude: deps.claude,
    memory: deps.memory,
    users: deps.users,
    audit: deps.audit,
    approvedDirectory: deps.settings.approvedDirectory,
  };
  const commands = registerCommands(commandDeps);

  bot.command("start", commands.start);
  bot.command("new", commands.newSession);
  bot.command("status", commands.status);
  bot.command("memory", commands.memory);
  bot.command("remember", commands.remember);
  bot.command("help", commands.help);

  // Message handler (agentic mode)
  const messageDeps: MessageDeps = {
    claude: deps.claude,
    memory: deps.memory,
    users: deps.users,
    audit: deps.audit,
    approvedDirectory: deps.settings.approvedDirectory,
    systemPrompt: deps.systemPrompt,
    cavemanMode: deps.cavemanMode,
  };
  bot.on("message:text", createMessageHandler(messageDeps));

  // Set bot commands menu
  bot.api.setMyCommands([
    { command: "start", description: "Welcome message" },
    { command: "new", description: "Start fresh session" },
    { command: "status", description: "Session info & cost" },
    { command: "memory", description: "Search or list memories" },
    { command: "remember", description: "Save to memory" },
    { command: "help", description: "All commands" },
  ]).catch((e) => log.warn({ error: e }, "Failed to set bot commands"));

  // Error handler
  bot.catch((err) => {
    log.error({ error: err.message }, "Bot error");
  });

  log.info("Bot created with middleware chain");
  return bot;
}
