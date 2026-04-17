import { resolve } from "node:path";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("security");

// Max input message length from Telegram users
export const MAX_INPUT_LENGTH = 2000;

// Max system prompt size to avoid ARG_MAX overflow
export const MAX_SYSTEM_PROMPT_BYTES = 50_000;

// Max single memory entry size
export const MAX_MEMORY_ENTRY_LENGTH = 500;

// Max MEMORY.md file size before rotation (100KB)
export const MAX_MEMORY_FILE_BYTES = 100_000;

// Session ID must be alphanumeric/dash/underscore
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{10,128}$/;

/**
 * Sanitize text for safe storage in MEMORY.md.
 * Strips patterns that could be used for prompt injection.
 */
export function sanitizeMemoryContent(content: string): string {
  return content
    // Strip separator sequences used by system prompt segmentation
    .replace(/---+/g, "")
    // Strip markdown headers that could override system prompt sections
    .replace(/^#{1,3}\s/gm, "")
    // Strip any "system" or "override" injection attempts
    .replace(/\[?(system|override|ignore|forget)\s*(prompt|instruction|previous|all)/gi, "[redacted]")
    // Limit length
    .slice(0, MAX_MEMORY_ENTRY_LENGTH)
    .trim();
}

/**
 * Validate a Claude session ID format before passing to CLI.
 */
export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
}

/**
 * Truncate system prompt to safe size.
 */
export function truncateSystemPrompt(prompt: string): string {
  if (Buffer.byteLength(prompt) <= MAX_SYSTEM_PROMPT_BYTES) {
    return prompt;
  }
  // Binary search for safe truncation point
  let truncated = prompt.slice(0, MAX_SYSTEM_PROMPT_BYTES);
  while (Buffer.byteLength(truncated) > MAX_SYSTEM_PROMPT_BYTES) {
    truncated = truncated.slice(0, -100);
  }
  return `${truncated}\n\n[memory truncated due to size limit]`;
}

export class SecurityValidator {
  constructor(private approvedDirectory: string) {}

  validateInput(input: string): { valid: boolean; reason?: string } {
    if (input.length > MAX_INPUT_LENGTH) {
      return {
        valid: false,
        reason: `Message too long (${input.length} chars, max ${MAX_INPUT_LENGTH})`,
      };
    }
    return { valid: true };
  }

  validatePath(filePath: string): { valid: boolean; reason?: string } {
    const resolved = resolve(filePath);
    const approved = resolve(this.approvedDirectory);

    if (!resolved.startsWith(approved)) {
      return {
        valid: false,
        reason: "Path is outside approved directory",
      };
    }

    return { valid: true };
  }

  validateSessionId(id: string): boolean {
    return isValidSessionId(id);
  }
}
