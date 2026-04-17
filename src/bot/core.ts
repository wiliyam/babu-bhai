import { Bot } from "grammy";
import type { Settings } from "../config/schema.js";
import type { ClaudeIntegration } from "../claude/facade.js";
import type { IdentityLoader } from "../identity/loader.js";
import type { MemoryStore } from "../memory/store.js";
import type { SpeechToText } from "../voice/stt.js";
import type { TextToSpeech } from "../voice/tts.js";
import type { AuditRepository, UserRepository } from "../storage/repositories.js";
import { createChildLogger } from "../utils/logger.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createRateLimitMiddleware } from "./middleware/rateLimit.js";
import { type CommandDeps, registerCommands } from "./handlers/command.js";
import { type MessageDeps, createMessageHandler } from "./handlers/message.js";
import { type VoiceDeps, createVoiceHandler } from "./handlers/voice.js";
import { type FileDeps, createFileHandler } from "./handlers/file.js";
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
  stt: SpeechToText | null;
  tts: TextToSpeech | null;
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

  // Onboarding
  const onboardingDeps: OnboardingDeps = {
    users: deps.users,
    audit: deps.audit,
    identityLoader: deps.identityLoader,
  };
  const onboarding = createOnboardingHandlers(onboardingDeps);

  // Commands
  const commandDeps: CommandDeps = {
    claude: deps.claude,
    memory: deps.memory,
    users: deps.users,
    audit: deps.audit,
    approvedDirectory: deps.settings.approvedDirectory,
  };
  const commands = registerCommands(commandDeps);

  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (isNewUser(onboardingDeps, userId)) return onboarding.startOnboarding(ctx);
    return commands.start(ctx);
  });

  bot.command("new", commands.newSession);
  bot.command("status", commands.status);
  bot.command("memory", commands.memory);
  bot.command("remember", commands.remember);
  bot.command("help", commands.help);
  bot.command("personality", async (ctx) => onboarding.startOnboarding(ctx));

  // Personality callback
  bot.callbackQuery(/^persona:/, onboarding.handlePersonalityCallback);

  // Voice handler
  if (deps.stt) {
    const voiceDeps: VoiceDeps = {
      stt: deps.stt,
      tts: deps.tts,
      claude: deps.claude,
      memory: deps.memory,
      users: deps.users,
      audit: deps.audit,
      approvedDirectory: deps.settings.approvedDirectory,
      systemPrompt: deps.systemPrompt,
    };
    const voiceHandler = createVoiceHandler(voiceDeps);
    bot.on("message:voice", voiceHandler);
    bot.on("message:audio", voiceHandler);
    log.info("Voice handler registered");
  }

  // File upload handler (documents, photos, videos)
  const fileDeps: FileDeps = {
    claude: deps.claude,
    memory: deps.memory,
    users: deps.users,
    audit: deps.audit,
    approvedDirectory: deps.settings.approvedDirectory,
    systemPrompt: deps.systemPrompt,
  };
  const fileHandler = createFileHandler(fileDeps);
  bot.on("message:document", fileHandler);
  bot.on("message:photo", fileHandler);
  bot.on("message:video", fileHandler);
  bot.on("message:sticker", fileHandler);
  log.info("File upload handler registered");

  // Text message handler
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

    if (isInOnboarding(userId)) {
      const handled = await onboarding.handleOnboardingText(ctx);
      if (handled) return;
    }

    if (isNewUser(onboardingDeps, userId) && !ctx.message?.text?.startsWith("/")) {
      return onboarding.startOnboarding(ctx);
    }

    return messageHandler(ctx);
  });

  // Bot commands menu
  bot.api.setMyCommands([
    { command: "start", description: "Welcome / setup" },
    { command: "new", description: "Start fresh session" },
    { command: "status", description: "Session info & cost" },
    { command: "memory", description: "Search or list memories" },
    { command: "remember", description: "Save to memory" },
    { command: "personality", description: "Change bot personality" },
    { command: "help", description: "All commands" },
  ]).catch((e) => log.warn({ error: e }, "Failed to set bot commands"));

  bot.catch((err) => {
    log.error({ error: err.message }, "Bot error");
  });

  log.info("Bot created with middleware + onboarding + voice");
  return bot;
}
