/**
 * File upload handler.
 *
 * Supports: documents, photos, videos (thumbnails).
 * Downloads file from Telegram, saves to temp, tells Claude about it.
 */
import { existsSync, mkdirSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import type { Context } from "grammy";
import { nanoid } from "nanoid";
import type { ClaudeIntegration } from "../../claude/facade.js";
import type { MemoryStore } from "../../memory/store.js";
import type { AuditRepository, UserRepository } from "../../storage/repositories.js";
import { SecurityValidator, truncateSystemPrompt } from "../../security/validator.js";
import { TOOL_ICONS } from "../../utils/constants.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("file-handler");

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB Telegram limit

// Where uploaded files are saved for Claude to access
const UPLOAD_DIR_NAME = ".babu-bhai/uploads";

export interface FileDeps {
  claude: ClaudeIntegration;
  memory: MemoryStore | null;
  users: UserRepository;
  audit: AuditRepository;
  approvedDirectory: string;
  systemPrompt: string;
}

export function createFileHandler(deps: FileDeps) {
  // Ensure upload directory exists
  const uploadDir = join(deps.approvedDirectory, UPLOAD_DIR_NAME);
  mkdirSync(uploadDir, { recursive: true });

  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    deps.users.upsert(userId, ctx.from?.username ?? null);

    // Extract file info from different message types
    const fileInfo = getFileInfo(ctx);
    if (!fileInfo) {
      await ctx.reply("Unsupported file type.");
      return;
    }

    const { fileId, fileName, fileSize, mimeType, caption } = fileInfo;

    // Size check
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      await ctx.reply(`File too large (${Math.round(fileSize / 1024 / 1024)}MB). Max 20MB.`);
      return;
    }

    deps.audit.log(userId, "file_upload", `${fileName} (${mimeType})`);

    await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    try {
      // Download file from Telegram
      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) {
        await ctx.reply("Failed to download file.");
        return;
      }

      const buffer = Buffer.from(await res.arrayBuffer());

      // Save to upload directory with unique name
      const ext = extname(fileName) || guessExtension(mimeType);
      const savedName = `${nanoid(8)}${ext}`;
      const savedPath = join(uploadDir, savedName);
      await writeFile(savedPath, buffer);

      log.info({ userId, file: savedName, size: buffer.length, mime: mimeType }, "File saved");

      // Notify user
      await ctx.reply(`📎 File received: \`${fileName}\` (${formatSize(buffer.length)})`, {
        parse_mode: "Markdown",
      });

      // Build prompt for Claude
      const prompt = caption
        ? `The user uploaded a file "${fileName}" (${mimeType}, ${formatSize(buffer.length)}) and said: "${caption}"\n\nThe file is saved at: ${savedPath}\n\nAnalyze or process the file as requested.`
        : `The user uploaded a file "${fileName}" (${mimeType}, ${formatSize(buffer.length)}).\n\nThe file is saved at: ${savedPath}\n\nDescribe what this file contains and ask what they'd like to do with it.`;

      // Process through Claude
      let systemPrompt = deps.systemPrompt;
      if (deps.memory) {
        const mem = deps.memory.loadMemoryFile(userId);
        if (mem) systemPrompt += `\n\n---\n\n# Memory\n${mem}`;
      }
      systemPrompt = truncateSystemPrompt(systemPrompt);

      // Show working status
      const statusMsg = await ctx.reply("🔄 _Analyzing file..._", { parse_mode: "Markdown" });

      const typingInterval = setInterval(() => {
        ctx.api.sendChatAction(chatId, "typing").catch(() => {});
      }, 4000);

      const toolLog: string[] = [];
      const response = await deps.claude.runCommand(prompt, userId, deps.approvedDirectory, {
        systemPrompt,
        onStream: (update) => {
          if (update.type === "tool_start" && update.toolName) {
            const icon = TOOL_ICONS[update.toolName] ?? "🔧";
            toolLog.push(`${icon} \`${update.toolName}\``);
          }
        },
      });

      clearInterval(typingInterval);

      // Delete status message
      try {
        await ctx.api.deleteMessage(chatId, statusMsg.message_id);
      } catch {}

      // Send response
      const reply = response.content || "(No response)";
      const footer = toolLog.length > 0 ? `\n\n${toolLog.join("  ")}` : "";
      const fullReply = reply + footer;

      if (fullReply.length > 4096) {
        const chunks = splitMessage(fullReply);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() => ctx.reply(chunk));
        }
      } else {
        await ctx.reply(fullReply, { parse_mode: "Markdown" }).catch(() => ctx.reply(fullReply));
      }

      // Cleanup old uploads (keep last 20)
      cleanupUploads(uploadDir, 20).catch(() => {});

    } catch (err) {
      log.error({ userId, error: err instanceof Error ? err.message : err }, "File handling failed");
      await ctx.reply("File processing failed. Try again.");
    }
  };
}

interface FileInfoResult {
  fileId: string;
  fileName: string;
  fileSize: number | undefined;
  mimeType: string;
  caption: string | undefined;
}

function getFileInfo(ctx: Context): FileInfoResult | null {
  const msg = ctx.message;
  if (!msg) return null;

  // Document
  if (msg.document) {
    return {
      fileId: msg.document.file_id,
      fileName: msg.document.file_name ?? `document${guessExtension(msg.document.mime_type)}`,
      fileSize: msg.document.file_size,
      mimeType: msg.document.mime_type ?? "application/octet-stream",
      caption: msg.caption,
    };
  }

  // Photo (get largest)
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    return {
      fileId: largest.file_id,
      fileName: `photo_${nanoid(6)}.jpg`,
      fileSize: largest.file_size,
      mimeType: "image/jpeg",
      caption: msg.caption,
    };
  }

  // Video
  if (msg.video) {
    return {
      fileId: msg.video.file_id,
      fileName: msg.video.file_name ?? `video_${nanoid(6)}.mp4`,
      fileSize: msg.video.file_size,
      mimeType: msg.video.mime_type ?? "video/mp4",
      caption: msg.caption,
    };
  }

  // Sticker
  if (msg.sticker) {
    return {
      fileId: msg.sticker.file_id,
      fileName: `sticker_${nanoid(6)}.webp`,
      fileSize: msg.sticker.file_size,
      mimeType: "image/webp",
      caption: undefined,
    };
  }

  return null;
}

function guessExtension(mime: string | undefined): string {
  if (!mime) return "";
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/json": ".json",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "text/html": ".html",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "application/zip": ".zip",
    "application/x-tar": ".tar",
  };
  return map[mime] ?? "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function splitMessage(text: string): string[] {
  if (text.length <= 4096) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 4096) { chunks.push(remaining); break; }
    let at = remaining.lastIndexOf("\n\n", 4096);
    if (at === -1) at = remaining.lastIndexOf("\n", 4096);
    if (at === -1) at = 4096;
    chunks.push(remaining.slice(0, at));
    remaining = remaining.slice(at).trimStart();
  }
  return chunks;
}

async function cleanupUploads(dir: string, keep: number): Promise<void> {
  const { readdir, stat, unlink } = await import("node:fs/promises");
  const files = await readdir(dir);
  if (files.length <= keep) return;

  const withTime = await Promise.all(
    files.map(async (f) => {
      const s = await stat(join(dir, f)).catch(() => null);
      return { name: f, mtime: s?.mtimeMs ?? 0 };
    }),
  );

  withTime.sort((a, b) => a.mtime - b.mtime);
  const toDelete = withTime.slice(0, files.length - keep);

  for (const f of toDelete) {
    await unlink(join(dir, f.name)).catch(() => {});
  }
}
