import { basename } from "node:path";
import type { Context } from "grammy";
import type { ClaudeIntegration } from "../../claude/facade.js";
import type { MemoryStore } from "../../memory/store.js";
import { parseSchedule } from "../../scheduler/parser.js";
import type { Scheduler } from "../../scheduler/runner.js";
import type {
	AuditRepository,
	UserRepository,
} from "../../storage/repositories.js";
import { APP_NAME, VERSION } from "../../utils/constants.js";
import { createChildLogger } from "../../utils/logger.js";
import { isVoiceReplyEnabled, setVoiceReply } from "./message.js";

const log = createChildLogger("commands");

export interface CommandDeps {
	claude: ClaudeIntegration;
	memory: MemoryStore | null;
	users: UserRepository;
	audit: AuditRepository;
	approvedDirectory: string;
	scheduler: Scheduler | null;
	ttsAvailable: boolean;
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
					"/voice — Toggle voice replies for text\n" +
					"/schedule — Schedule a recurring task\n" +
					"/help — All commands\n\n" +
					"Just send a message, text or voice, to start working.",
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
			const voice = isVoiceReplyEnabled(userId) ? "on" : "off";

			await ctx.reply(
				`*Session Status*\n\n` +
					`User: ${ctx.from?.username ?? userId}\n` +
					`Total cost: $${user?.totalCost.toFixed(4) ?? "0.00"}\n` +
					`Voice reply: ${voice}\n` +
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

		voice: async (ctx: Context) => {
			const userId = ctx.from?.id;
			if (!userId) return;

			if (!deps.ttsAvailable) {
				await ctx.reply(
					"TTS is not available. Make sure VOICE_ENABLED=true and restart the bot.",
				);
				return;
			}

			const arg = ctx.message?.text?.replace(/^\/voice\s*/, "").trim().toLowerCase();
			const current = isVoiceReplyEnabled(userId);
			let next: boolean;
			if (arg === "on") next = true;
			else if (arg === "off") next = false;
			else next = !current; // toggle

			setVoiceReply(userId, next);
			deps.audit.log(userId, "command:voice", next ? "on" : "off");

			await ctx.reply(
				next
					? "🔊 Voice replies *ON* — I will send both text and voice."
					: "🔇 Voice replies *OFF* — text only.",
				{ parse_mode: "Markdown" },
			);
		},

		schedule: async (ctx: Context) => {
			if (!deps.scheduler) {
				await ctx.reply("Scheduler disabled. Set `ENABLE_SCHEDULER=true`.", {
					parse_mode: "Markdown",
				});
				return;
			}
			const userId = ctx.from?.id;
			const chatId = ctx.chat?.id;
			if (!userId || !chatId) return;

			const raw = ctx.message?.text?.replace(/^\/schedule\s*/, "").trim() ?? "";
			if (!raw) {
				await ctx.reply(
					"*Schedule a recurring task*\n\n" +
						"Format: `/schedule <when> | <name> | <prompt>`\n\n" +
						"*Examples:*\n" +
						"`/schedule every day at 9am | Morning brief | Summarize my calendar`\n" +
						"`/schedule every 15 minutes | Check | Run tests and report failures`\n" +
						"`/schedule 0 */6 * * * | Hex check | Check dev env health`\n\n" +
						"Phrases: `every day at 9am`, `every 15 minutes`, `hourly`, `weekly`, `every monday at 10:30`. Or raw 5-field cron.",
					{ parse_mode: "Markdown" },
				);
				return;
			}

			const segments = raw.split("|").map((s) => s.trim());
			if (segments.length < 3) {
				await ctx.reply(
					"Need three parts separated by `|`: `<when> | <name> | <prompt>`",
					{ parse_mode: "Markdown" },
				);
				return;
			}
			const [scheduleStr, name, ...promptParts] = segments;
			const prompt = promptParts.join(" | ").trim();
			if (!name || !prompt) {
				await ctx.reply("Name and prompt cannot be empty.");
				return;
			}

			try {
				const parsed = parseSchedule(scheduleStr);
				const job = deps.scheduler.create({
					name,
					cronExpression: parsed.cron,
					prompt,
					userId,
					chatId,
				});
				await ctx.reply(
					`✅ Scheduled *${escMd(job.name)}*\n` +
						`Runs: ${escMd(parsed.description)}\n` +
						`ID: \`${job.id}\`\n\n` +
						`Cancel with /unschedule \`${job.id}\``,
					{ parse_mode: "Markdown" },
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				await ctx.reply(`❌ ${msg}`);
			}
		},

		jobs: async (ctx: Context) => {
			if (!deps.scheduler) {
				await ctx.reply("Scheduler disabled.");
				return;
			}
			const userId = ctx.from?.id;
			if (!userId) return;

			const list = deps.scheduler.list(userId);
			if (list.length === 0) {
				await ctx.reply("No scheduled jobs. Use /schedule to create one.");
				return;
			}
			const lines = list.map(
				(j, i) =>
					`${i + 1}. *${escMd(j.name)}*\n` +
					`   \`${j.cronExpression}\` — ran ${j.runCount}×\n` +
					`   id: \`${j.id}\``,
			);
			await ctx.reply(
				`*Scheduled Jobs (${list.length})*\n\n${lines.join("\n\n")}`,
				{ parse_mode: "Markdown" },
			);
		},

		unschedule: async (ctx: Context) => {
			if (!deps.scheduler) {
				await ctx.reply("Scheduler disabled.");
				return;
			}
			const userId = ctx.from?.id;
			if (!userId) return;

			const id = ctx.message?.text?.replace(/^\/unschedule\s*/, "").trim();
			if (!id) {
				await ctx.reply("Usage: `/unschedule <job-id>` (get IDs from /jobs)", {
					parse_mode: "Markdown",
				});
				return;
			}
			const ok = deps.scheduler.cancel(userId, id);
			await ctx.reply(
				ok ? `✅ Cancelled \`${id}\`` : `❌ No active job \`${id}\``,
				{ parse_mode: "Markdown" },
			);
		},

		help: async (ctx: Context) => {
			await ctx.reply(
				`*${APP_NAME} — Commands*\n\n` +
					"/start — Welcome message\n" +
					"/new — Reset session (fresh context)\n" +
					"/status — Session info & cost\n" +
					"/memory [query] — Search or list memories\n" +
					"/remember <text> — Save to memory\n" +
					"/voice [on|off] — Toggle voice replies for text messages\n" +
					"/schedule — Schedule a recurring task\n" +
					"/jobs — List scheduled jobs\n" +
					"/unschedule <id> — Cancel a job\n" +
					"/help — This message\n\n" +
					"*Voice input:* send a voice message — auto-transcribed and auto-voice-back.\n" +
					"*Files:* send documents, photos, or videos.\n" +
					"Otherwise, just send any message to talk to Claude.",
				{ parse_mode: "Markdown" },
			);
		},
	};
}

function escMd(text: string): string {
	return text.replace(/([*_`\[])/g, "\\$1");
}
