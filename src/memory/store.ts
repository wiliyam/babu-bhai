import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MemoryRepository } from "../storage/repositories.js";
import { MAX_MEMORY_ENTRY_LENGTH, MAX_MEMORY_FILE_BYTES, sanitizeMemoryContent } from "../security/validator.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("memory");

/**
 * Persistent memory system — scoped per user.
 *
 * Each user gets their own MEMORY.md and daily notes.
 * Content is sanitized before storage to prevent prompt injection.
 */
export class MemoryStore {
  private memoryDir: string;

  constructor(
    memoryDir: string,
    private repo: MemoryRepository,
  ) {
    this.memoryDir = resolve(memoryDir);
    mkdirSync(this.memoryDir, { recursive: true });
  }

  /** Add a sanitized memory entry (user-scoped) */
  remember(
    userId: number,
    content: string,
    type: "fact" | "preference" | "decision" | "context" | "task" = "fact",
    importance = 0.5,
  ): void {
    // SECURITY: Sanitize content before storage
    const sanitized = sanitizeMemoryContent(content);
    if (!sanitized) return;

    // Store in SQLite for search (already user-scoped)
    this.repo.add(userId, type, sanitized, "conversation", importance);

    // Append to user-scoped MEMORY.md
    const memoryPath = this.getUserMemoryPath(userId);
    const timestamp = new Date().toISOString().split("T")[0];
    const entry = `\n- [${timestamp}] (${type}) ${sanitized}`;

    // SECURITY: Cap file size to prevent DoS
    if (existsSync(memoryPath)) {
      const stats = statSync(memoryPath);
      if (stats.size > MAX_MEMORY_FILE_BYTES) {
        log.warn({ userId, size: stats.size }, "Memory file at max size, skipping write");
        return;
      }
      const existing = readFileSync(memoryPath, "utf-8");
      writeFileSync(memoryPath, existing + entry);
    } else {
      writeFileSync(
        memoryPath,
        `# Memory — User ${userId}\n\nPersistent facts and context.\n${entry}`,
      );
    }

    log.info({ userId, type }, "Memory stored");
  }

  /** Search memories by keyword (user-scoped) */
  search(userId: number, query: string): string[] {
    const results = this.repo.search(userId, query, 10);
    for (const r of results) {
      this.repo.touch(r.id);
    }
    return results.map((r) => r.content);
  }

  /** Get recent memories (user-scoped) */
  getRecent(userId: number, limit = 20): string[] {
    return this.repo.getRecent(userId, limit).map((r) => r.content);
  }

  /** Load user-scoped MEMORY.md for system prompt injection */
  loadMemoryFile(userId: number): string {
    const memoryPath = this.getUserMemoryPath(userId);
    if (existsSync(memoryPath)) {
      return readFileSync(memoryPath, "utf-8").trim();
    }
    return "";
  }

  /** Get user-scoped daily note */
  getDailyNote(userId: number): string {
    const today = new Date().toISOString().split("T")[0];
    const notePath = this.getUserDailyPath(userId, today);
    if (existsSync(notePath)) {
      return readFileSync(notePath, "utf-8").trim();
    }
    return "";
  }

  /** Append to user-scoped daily note */
  appendDailyNote(userId: number, content: string): void {
    const today = new Date().toISOString().split("T")[0];
    const notePath = this.getUserDailyPath(userId, today);
    const sanitized = sanitizeMemoryContent(content);
    if (!sanitized) return;

    if (existsSync(notePath)) {
      const existing = readFileSync(notePath, "utf-8");
      writeFileSync(notePath, `${existing}\n${sanitized}`);
    } else {
      const dir = resolve(this.memoryDir, String(userId));
      mkdirSync(dir, { recursive: true });
      writeFileSync(notePath, `# ${today}\n\n${sanitized}`);
    }
  }

  private getUserMemoryPath(userId: number): string {
    const dir = resolve(this.memoryDir, String(userId));
    mkdirSync(dir, { recursive: true });
    return resolve(dir, "MEMORY.md");
  }

  private getUserDailyPath(userId: number, date: string): string {
    const dir = resolve(this.memoryDir, String(userId));
    mkdirSync(dir, { recursive: true });
    return resolve(dir, `${date}.md`);
  }
}
