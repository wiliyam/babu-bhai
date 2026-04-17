import { Bot } from "grammy";
import type { Settings } from "../config/schema.js";
import type { ClaudeIntegration } from "../claude/facade.js";
import type { IdentityLoader } from "../identity/loader.js";
import type { MemoryStore } from "../memory/store.js";
import type { AuditRepository, UserRepository } from "../storage/repositories.js";
import { createChildLogger } from "../utils/logger.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createRateLimitMiddleware } from "./middleware/rateLimit.js";
import { type CommandDeps, registerCommands } from "./handlers/command.js";
import { type MessageDeps, createMessageHandler } from "./handlers/message.js";
import {
  type OnboardingDeps,
  createOnboardingHandlers,
  isNewUser,
  isInOnboarding,
} from "./handlers/onboarding.js";
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
  identityLoader: IdentityLoader;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.settings.telegramBotToken);

  // Middleware chain
  bot.use(createAuthMiddleware(deps.auth));
  bot.use(
    createRateLimitMiddleware(
      deps.settings.rateLimitRequests,
      deps.settings.rateLimitWindowMs,
    ),
  );

  // Onboarding handlers
  const onboardingDeps: OnboardingDeps = {
    users: deps.users,
    audit: deps.audit,
    identityLoader: deps.identityLoader,
  };
  const onboarding = createOnboardingHandlers(onboardingDeps);

  // Register commands
  const commandDeps: CommandDeps = {
    claude: deps.claude,
    memory: deps.memory,
    users: deps.users,
    audit: deps.audit,
    approvedDirectory: deps.settings.approvedDirectory,
  };
  const commands = registerCommands(commandDeps);

  // /start triggers onboarding for new users, welcome for existing
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (isNewUser(onboardingDeps, userId)) {
      return onboarding.startOnboarding(ctx);
    }
    return commands.start(ctx);
  });

  bot.command("new", commands.newSession);
  bot.command("status", commands.status);
  bot.command("memory", commands.memory);
  bot.command("remember", commands.remember);
  bot.command("help", commands.help);

  // /personality — re-trigger personality picker anytime
  bot.command("personality", async (ctx) => {
    return onboarding.startOnboarding(ctx);
  });

  // Handle personality selection callbacks
  bot.callbackQuery(/^persona:/, onboarding.handlePersonalityCallback);

  // Message handler — check onboarding first
  const messageDeps: MessageDeps = {
    claude: deps.claude,
    memory: deps.memory,
    users: deps.users,
    audit: deps.audit,
    approvedDirectory: deps.settings.approvedDirectory,
    systemPrompt: deps.systemPrompt,
  };
  const messageHandler = createMessageHandler(messageDeps);

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // If user is in onboarding flow, handle that first
    if (isInOnboarding(userId)) {
      const handled = await onboarding.handleOnboardingText(ctx);
      if (handled) return;
    }

    // First-time user who didn't /start — trigger onboarding
    if (isNewUser(onboardingDeps, userId) && !ctx.message?.text?.startsWith("/")) {
      return onboarding.startOnboarding(ctx);
    }

    // Normal message handling
    return messageHandler(ctx);
  });

  // Set bot commands menu
  bot.api
    .setMyCommands([
      { command: "start", description: "Welcome / setup" },
      { command: "new", description: "Start fresh session" },
      { command: "status", description: "Session info & cost" },
      { command: "memory", description: "Search or list memories" },
      { command: "remember", description: "Save to memory" },
      { command: "personality", description: "Change bot personality" },
      { command: "help", description: "All commands" },
    ])
    .catch((e) => log.warn({ error: e }, "Failed to set bot commands"));

  // Error handler
  bot.catch((err) => {
    log.error({ error: err.message }, "Bot error");
  });

  log.info("Bot created with middleware chain + onboarding");
  return bot;
}
