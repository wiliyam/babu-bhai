import type { Context } from "grammy";
import { InputFile } from "grammy";
import type { ClaudeIntegration } from "../../claude/facade.js";
import type { MemoryStore } from "../../memory/store.js";
import type { AuditRepository, UserRepository } from "../../storage/repositories.js";
import { SecurityValidator, truncateSystemPrompt } from "../../security/validator.js";
import { TOOL_ICONS } from "../../utils/constants.js";
import { createChildLogger } from "../../utils/logger.js";
import type { TextToSpeech } from "../../voice/tts.js";

const log = createChildLogger("message-handler");

export interface MessageDeps {
  claude: ClaudeIntegration;
  memory: MemoryStore | null;
  users: UserRepository;
  audit: AuditRepository;
  approvedDirectory: string;
  systemPrompt: string;
  tts?: TextToSpeech | null;
}

// Per-user toggle — when enabled, text messages also get a voice reply.
// In-memory only; resets on restart. Good enough for MVP.
const voiceReplyUsers = new Set<number>();

export function isVoiceReplyEnabled(userId: number): boolean {
  return voiceReplyUsers.has(userId);
}

export function setVoiceReply(userId: number, enabled: boolean): void {
  if (enabled) voiceReplyUsers.add(userId);
  else voiceReplyUsers.delete(userId);
}

// Track active requests — prevents concurrent Claude spawns per user
const activeRequests = new Set<number>();

// Max concurrent Claude processes globally
const MAX_GLOBAL_CONCURRENT = 5;
let globalActive = 0;

// Minimum interval between Telegram message edits (ms)
const EDIT_THROTTLE_MS = 1500;

export function createMessageHandler(deps: MessageDeps) {
  const validator = new SecurityValidator(deps.approvedDirectory);

  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;

    if (!userId || !chatId || !text) return;
    if (text.startsWith("/")) return;

    const inputCheck = validator.validateInput(text);
    if (!inputCheck.valid) {
      await ctx.reply(inputCheck.reason ?? "Message rejected.");
      return;
    }

    deps.users.upsert(userId, ctx.from?.username ?? null);
    deps.audit.log(userId, "message", text.slice(0, 200));

    if (activeRequests.has(userId)) {
      await ctx.reply("Still working on your previous request...");
      return;
    }

    if (globalActive >= MAX_GLOBAL_CONCURRENT) {
      await ctx.reply("Server is busy. Please try again in a moment.");
      return;
    }

    activeRequests.add(userId);
    globalActive++;

    // Send initial status message that we'll edit with live updates
    let statusMessageId: number | null = null;
    try {
      const statusMsg = await ctx.reply("🔄 _Working..._", { parse_mode: "Markdown" });
      statusMessageId = statusMsg.message_id;
    } catch {
      // If initial message fails, continue without live updates
    }

    // Typing indicator
    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(chatId, "typing").catch(() => {});
    }, 4000);
    await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    // Track live progress for editing the status message
    const toolLog: string[] = [];
    let lastEditTime = 0;
    let lastTextSnippet = "";

    const updateStatusMessage = async (line: string) => {
      if (!statusMessageId) return;

      const now = Date.now();
      if (now - lastEditTime < EDIT_THROTTLE_MS) return;
      lastEditTime = now;

      try {
        const statusText = toolLog.length > 0
          ? toolLog.join("\n") + (line ? `\n${line}` : "")
          : line || "🔄 _Working..._";

        await ctx.api.editMessageText(chatId, statusMessageId, statusText, {
          parse_mode: "Markdown",
        }).catch(() => {});
      } catch {
        // Edit can fail if message unchanged or too fast — ignore
      }
    };

    try {
      let prompt = deps.systemPrompt;

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

      prompt = truncateSystemPrompt(prompt);

      // Execute with live streaming callbacks
      const response = await deps.claude.runCommand(text, userId, deps.approvedDirectory, {
        systemPrompt: prompt,
        onStream: (update) => {
          if (update.type === "tool_start" && update.toolName) {
            const icon = TOOL_ICONS[update.toolName] ?? "🔧";
            const detail = update.content ? ` → \`${escapeMarkdown(update.content)}\`` : "";
            const entry = `${icon} \`${update.toolName}\`${detail}`;
            toolLog.push(entry);
            updateStatusMessage("");
          } else if (update.type === "tool_end" && update.toolName) {
            // Mark tool as complete with checkmark
            const idx = toolLog.findIndex((l) => l.includes(`\`${update.toolName}\``) && !l.startsWith("✅"));
            if (idx !== -1) {
              toolLog[idx] = toolLog[idx].replace(/^./, "✅");
              updateStatusMessage("");
            }
          } else if (update.type === "thinking") {
            updateStatusMessage("🧠 _Thinking..._");
          } else if (update.type === "text" && update.content) {
            if (!lastTextSnippet && update.content.length > 10) {
              lastTextSnippet = update.content.slice(0, 100);
              updateStatusMessage("✏️ _Composing response..._");
            }
          }
        },
      });

      // Delete the status message now that we have the real response
      if (statusMessageId) {
        try {
          await ctx.api.deleteMessage(chatId, statusMessageId);
        } catch {
          // Message might already be deleted or expired
        }
        statusMessageId = null;
      }

      // Send final response
      const reply = response.content || "(No response)";

      // Add tool summary if tools were used
      let footer = "";
      if (toolLog.length > 0) {
        footer = `\n\n${toolLog.join("  ")}`;
      }

      const fullReply = reply + footer;
      const chunks = splitMessage(fullReply);

      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() =>
          ctx.reply(chunk),
        );
      }

      // Optional voice reply — when user toggled /voice on
      if (
        deps.tts &&
        voiceReplyUsers.has(userId) &&
        !response.isError &&
        reply.length > 0 &&
        reply.length < 4000
      ) {
        try {
          await ctx.api.sendChatAction(chatId, "record_voice").catch(() => {});
          const speech = stripForSpeech(reply);
          if (speech) {
            const tts = await deps.tts.synthesize(speech);
            if (tts) {
              await ctx.api.sendVoice(
                chatId,
                new InputFile(tts.audio, "reply.ogg"),
                { duration: tts.durationSec },
              );
            }
          }
        } catch (err) {
          log.warn(
            { error: err instanceof Error ? err.message : err },
            "Voice reply failed",
          );
        }
      }

      // Auto-extract memories
      if (deps.memory && !response.isError) {
        extractAndStoreMemory(deps.memory, userId, text);
      }
    } catch (error) {
      log.error({ userId, error: error instanceof Error ? error.message : error }, "Message handling failed");

      // Clean up status message on error
      if (statusMessageId) {
        try {
          await ctx.api.editMessageText(chatId, statusMessageId, "Something went wrong. Please try again.");
        } catch {
          await ctx.reply("Something went wrong. Please try again.");
        }
      } else {
        await ctx.reply("Something went wrong. Please try again.");
      }
    } finally {
      clearInterval(typingInterval);
      activeRequests.delete(userId);
      globalActive--;
    }
  };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
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

function stripForSpeech(text: string): string {
  // Remove markdown formatting and code blocks so TTS reads cleanly
  return text
    .replace(/```[\s\S]*?```/g, " ... code block ... ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#+\s*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

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
