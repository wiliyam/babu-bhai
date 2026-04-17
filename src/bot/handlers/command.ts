import { basename } from "node:path";
import type { Context } from "grammy";
import type { ClaudeIntegration } from "../../claude/facade.js";
import type { MemoryStore } from "../../memory/store.js";
import type { AuditRepository, UserRepository } from "../../storage/repositories.js";
import { APP_NAME, VERSION } from "../../utils/constants.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("commands");

export interface CommandDeps {
  claude: ClaudeIntegration;
  memory: MemoryStore | null;
  users: UserRepository;
  audit: AuditRepository;
  approvedDirectory: string;
}

export function registerCommands(deps: CommandDeps) {
  return {
    start: async (ctx: Context) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      deps.users.upsert(userId, ctx.from?.username ?? null);
      deps.audit.log(userId, "command:start");

      await ctx.reply(
        `*${APP_NAME}* v${VERSION}\n\n` +
          "Your AI agent, ready to work.\n\n" +
          "*Commands:*\n" +
          "/start — This message\n" +
          "/new — Start fresh session\n" +
          "/status — Current session info\n" +
          "/memory — Search memory\n" +
          "/remember — Save something to memory\n" +
          "/help — All commands\n\n" +
          "Just send a message to start working.",
        { parse_mode: "Markdown" },
      );
    },

    newSession: async (ctx: Context) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      deps.claude.resetSession(userId, deps.approvedDirectory);
      deps.audit.log(userId, "command:new");

      await ctx.reply("Session reset. Starting fresh.");
    },

    status: async (ctx: Context) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const user = deps.users.findById(userId);
      deps.audit.log(userId, "command:status");

      await ctx.reply(
        `*Session Status*\n\n` +
          `User: ${ctx.from?.username ?? userId}\n` +
          `Total cost: $${user?.totalCost.toFixed(4) ?? "0.00"}\n` +
          `Project: \`${basename(deps.approvedDirectory) || "/"}\``,
        { parse_mode: "Markdown" },
      );
    },

    memory: async (ctx: Context) => {
      if (!deps.memory) {
        await ctx.reply("Memory is disabled.");
        return;
      }

      const userId = ctx.from?.id;
      if (!userId) return;

      const query = ctx.message?.text?.replace("/memory", "").trim();
      if (!query) {
        const recent = deps.memory.getRecent(userId, 10);
        if (recent.length === 0) {
          await ctx.reply("No memories stored yet.");
          return;
        }
        await ctx.reply(
          "*Recent Memories:*\n\n" +
            recent.map((m, i) => `${i + 1}. ${m}`).join("\n"),
          { parse_mode: "Markdown" },
        );
        return;
      }

      const results = deps.memory.search(userId, query);
      if (results.length === 0) {
        await ctx.reply(`No memories found for "${query}".`);
        return;
      }

      await ctx.reply(
        `*Memory search: "${query}"*\n\n` +
          results.map((m, i) => `${i + 1}. ${m}`).join("\n"),
        { parse_mode: "Markdown" },
      );
    },

    remember: async (ctx: Context) => {
      if (!deps.memory) {
        await ctx.reply("Memory is disabled.");
        return;
      }

      const userId = ctx.from?.id;
      if (!userId) return;

      const content = ctx.message?.text?.replace("/remember", "").trim();
      if (!content) {
        await ctx.reply("Usage: /remember <something to remember>");
        return;
      }

      deps.memory.remember(userId, content, "fact", 0.8);
      await ctx.reply(`Remembered: "${content}"`);
    },

    help: async (ctx: Context) => {
      await ctx.reply(
        `*${APP_NAME} — Commands*\n\n` +
          "/start — Welcome message\n" +
          "/new — Reset session (fresh context)\n" +
          "/status — Session info & cost\n" +
          "/memory [query] — Search or list memories\n" +
          "/remember <text> — Save to memory\n" +
          "/help — This message\n\n" +
          "*Just send any message* to talk to Claude.\n" +
          "The bot has full access to your project files.",
        { parse_mode: "Markdown" },
      );
    },
  };
}
