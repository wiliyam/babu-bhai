import type { Context } from "grammy";
import type { ClaudeIntegration } from "../../claude/facade.js";
import type { MemoryStore } from "../../memory/store.js";
import type { AuditRepository, UserRepository } from "../../storage/repositories.js";
import { SecurityValidator, truncateSystemPrompt } from "../../security/validator.js";
import { TOOL_ICONS } from "../../utils/constants.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("message-handler");

export interface MessageDeps {
  claude: ClaudeIntegration;
  memory: MemoryStore | null;
  users: UserRepository;
  audit: AuditRepository;
  approvedDirectory: string;
  systemPrompt: string;
  cavemanMode: string;
}

// Track active requests — prevents concurrent Claude spawns per user
const activeRequests = new Set<number>();

// Max concurrent Claude processes globally
const MAX_GLOBAL_CONCURRENT = 5;
let globalActive = 0;

export function createMessageHandler(deps: MessageDeps) {
  const validator = new SecurityValidator(deps.approvedDirectory);

  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;

    if (!userId || !chatId || !text) return;

    // Skip commands
    if (text.startsWith("/")) return;

    // SECURITY: Validate input length
    const inputCheck = validator.validateInput(text);
    if (!inputCheck.valid) {
      await ctx.reply(inputCheck.reason ?? "Message rejected.");
      return;
    }

    // Track user
    deps.users.upsert(userId, ctx.from?.username ?? null);
    deps.audit.log(userId, "message", text.slice(0, 200));

    // Prevent concurrent requests per user
    if (activeRequests.has(userId)) {
      await ctx.reply("Still working on your previous request...");
      return;
    }

    // Global concurrency cap
    if (globalActive >= MAX_GLOBAL_CONCURRENT) {
      await ctx.reply("Server is busy. Please try again in a moment.");
      return;
    }

    activeRequests.add(userId);
    globalActive++;

    // Typing indicator
    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(chatId, "typing").catch(() => {});
    }, 4000);
    await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    try {
      // Build system prompt with memory context (capped for safety)
      let prompt = deps.systemPrompt;

      // Inject Caveman mode instructions
      if (deps.cavemanMode !== "off") {
        prompt += `\n\n---\n\n${getCavemanPrompt(deps.cavemanMode)}`;
      }

      if (deps.memory) {
        const memoryContent = deps.memory.loadMemoryFile(userId);
        const dailyNote = deps.memory.getDailyNote(userId);
        if (memoryContent) {
          prompt += `\n\n---\n\n# Memory\n${memoryContent}`;
        }
        if (dailyNote) {
          prompt += `\n\n---\n\n# Today's Notes\n${dailyNote}`;
        }
      }

      // SECURITY: Cap system prompt size
      prompt = truncateSystemPrompt(prompt);

      // Execute via Claude
      const toolUpdates: string[] = [];
      const response = await deps.claude.runCommand(text, userId, deps.approvedDirectory, {
        systemPrompt: prompt,
        onStream: (update) => {
          if (update.type === "tool_start" && update.toolName) {
            const icon = TOOL_ICONS[update.toolName] ?? "🔧";
            toolUpdates.push(`${icon} ${update.toolName}`);
          }
        },
      });

      // Format response
      let reply = response.content;

      if (toolUpdates.length > 0) {
        reply += `\n\n_Tools: ${toolUpdates.join(", ")}_`;
      }

      if (response.cost > 0) {
        reply += `\n_Cost: $${response.cost.toFixed(4)} | ${response.durationMs}ms_`;
      }

      // Send response
      const chunks = splitMessage(reply);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() =>
          ctx.reply(chunk),
        );
      }

      // Auto-extract memories from conversation (user-scoped)
      if (deps.memory && !response.isError) {
        extractAndStoreMemory(deps.memory, userId, text);
      }
    } catch (error) {
      // SECURITY: Never leak internal errors to Telegram users
      log.error({ userId, error: error instanceof Error ? error.message : error }, "Message handling failed");
      await ctx.reply("Something went wrong. Please try again.");
    } finally {
      clearInterval(typingInterval);
      activeRequests.delete(userId);
      globalActive--;
    }
  };
}

function getCavemanPrompt(mode: string): string {
  switch (mode) {
    case "lite":
      return "Respond concisely. Remove filler words, maintain grammar. Code blocks unchanged.";
    case "full":
      return "Terse like caveman. Drop articles, fragments OK. Pattern: [thing] [action] [reason]. Code unchanged. No pleasantries.";
    case "ultra":
      return "Max compression. Telegraphic style. No articles, no filler, no hedging. Code/URLs/paths untouched. ACTIVE EVERY RESPONSE.";
    default:
      return "";
  }
}

function splitMessage(text: string): string[] {
  if (text.length <= 4096) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= 4096) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n\n", 4096);
    if (splitAt === -1) splitAt = remaining.lastIndexOf("\n", 4096);
    if (splitAt === -1) splitAt = 4096;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Auto-extract "remember that..." patterns from user messages.
 */
function extractAndStoreMemory(
  memory: MemoryStore,
  userId: number,
  userMessage: string,
): void {
  const rememberPatterns = [
    /remember that (.+)/i,
    /note that (.+)/i,
    /keep in mind[: ]+(.+)/i,
    /don't forget[: ]+(.+)/i,
  ];

  for (const pattern of rememberPatterns) {
    const match = userMessage.match(pattern);
    if (match?.[1]) {
      memory.remember(userId, match[1].trim(), "fact", 0.9);
      return;
    }
  }
}
