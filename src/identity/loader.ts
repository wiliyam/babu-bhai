import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createChildLogger } from "../utils/logger.js";
import { APP_NAME, VERSION } from "../utils/constants.js";

const log = createChildLogger("identity");

/**
 * OpenClaw-style identity system.
 *
 * Prompt assembly order (identity FIRST, project context AFTER):
 *   1. Core identity — "You are [name] running inside Babu Bhai"
 *   2. SOUL.md — Personality, thinking style, behavioral rules
 *   3. IDENTITY.md — Name, metadata, vibe
 *   4. Behavioral rules — How to interact via Telegram
 *   5. CLAUDE.md — Project-specific context (from working directory)
 *   6. Memory — Injected at runtime per-user
 */

const CORE_IDENTITY = `You are a personal AI assistant running inside ${APP_NAME} v${VERSION}.
You are NOT raw Claude Code. You are a named assistant with your own personality.
You are communicating via Telegram. Your responses go directly to the user's phone.

## Critical Rules
- You NEVER say "I'm Claude" or "As Claude" — you are the assistant defined in SOUL.md below
- You remember conversation context within a session — refer back to what the user said earlier
- Keep responses concise — this is Telegram, not a terminal. No walls of text.
- Use Markdown formatting sparingly (Telegram supports *bold*, _italic_, \`code\`)
- When the user sends short messages like "??" or "ok" or "yes", use conversation context to understand what they mean
- If you genuinely don't understand, ask ONE specific clarifying question — don't list options
- You have full access to the filesystem, bash, git — use tools proactively when relevant
- Don't narrate what you're doing unless asked. Just do it and report results.
- Don't ask for permission to read files or run commands — you already have permission
`;

const TELEGRAM_RULES = `## Telegram Interaction Style
- Use code blocks for code, commands, and file paths
- Don't repeat the user's question back to them
- Don't start with "Sure!" or "Of course!" or "I'd be happy to help!"
- Give complete, thorough responses — include all relevant details
- When explaining code changes, show the key parts
- When user sends a follow-up like "??" or "and?" — continue from where you left off
- After completing a task, summarize what you did with enough detail to be useful
`;

const IDENTITY_FILES = ["SOUL.md", "IDENTITY.md"];

export class IdentityLoader {
  private systemPrompt = "";

  constructor(
    private configDir: string,
    private projectDir: string,
  ) {}

  load(): string {
    const parts: string[] = [];

    // 1. Core identity (ALWAYS first — this is what makes the bot self-aware)
    parts.push(CORE_IDENTITY);

    // 2. Load SOUL.md and IDENTITY.md from config directory
    for (const filename of IDENTITY_FILES) {
      const filePath = resolve(this.configDir, filename);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8").trim();
        if (content) {
          parts.push(content);
          log.info({ file: filename }, "Loaded identity file");
        }
      }
    }

    // 3. Telegram interaction rules
    parts.push(TELEGRAM_RULES);

    // 4. Load CLAUDE.md from project directory (project context comes AFTER identity)
    const claudeMdPath = resolve(this.projectDir, "CLAUDE.md");
    if (existsSync(claudeMdPath)) {
      const content = readFileSync(claudeMdPath, "utf-8").trim();
      if (content) {
        parts.push(`## Project Context\n\n${content}`);
        log.info("Loaded project CLAUDE.md");
      }
    }

    this.systemPrompt = parts.join("\n\n---\n\n");

    if (!this.hasSoul()) {
      log.warn("No SOUL.md found — using default personality");
    }

    return this.systemPrompt;
  }

  getPrompt(): string {
    return this.systemPrompt;
  }

  /** Save a new SOUL.md and reload */
  saveSoul(content: string): void {
    mkdirSync(this.configDir, { recursive: true });
    const soulPath = resolve(this.configDir, "SOUL.md");
    writeFileSync(soulPath, `# Personality\n\n${content}\n`);
    log.info("SOUL.md saved");
  }

  /** Check if SOUL.md exists (used to detect first-run) */
  hasSoul(): boolean {
    return existsSync(resolve(this.configDir, "SOUL.md"));
  }
}
