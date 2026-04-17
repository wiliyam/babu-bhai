/**
 * Voice message handler.
 *
 * 1. Download OGG/Opus voice from Telegram
 * 2. Transcribe via STT (Groq Whisper)
 * 3. Show transcript to user
 * 4. Process as text prompt through Claude
 * 5. Optionally reply with TTS voice message
 */
import type { Context } from "grammy";
import type { SpeechToText } from "../../voice/stt.js";
import type { TextToSpeech } from "../../voice/tts.js";
import type { ClaudeIntegration } from "../../claude/facade.js";
import type { MemoryStore } from "../../memory/store.js";
import type { AuditRepository, UserRepository } from "../../storage/repositories.js";
import { SecurityValidator, truncateSystemPrompt } from "../../security/validator.js";
import { TOOL_ICONS } from "../../utils/constants.js";
import { InputFile } from "grammy";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("voice-handler");

const MAX_VOICE_SECONDS = 300;

export interface VoiceDeps {
  stt: SpeechToText;
  tts: TextToSpeech | null;
  claude: ClaudeIntegration;
  memory: MemoryStore | null;
  users: UserRepository;
  audit: AuditRepository;
  approvedDirectory: string;
  systemPrompt: string;
}

export function createVoiceHandler(deps: VoiceDeps) {
  const validator = new SecurityValidator(deps.approvedDirectory);

  return async (ctx: Context): Promise<void> => {
    const voice = ctx.message?.voice ?? ctx.message?.audio;
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!voice || !userId || !chatId) return;

    if (!deps.stt.enabled) {
      await ctx.reply("Voice not configured. Set `GROQ_API_KEY` to enable.");
      return;
    }

    if (voice.duration && voice.duration > MAX_VOICE_SECONDS) {
      await ctx.reply(`Voice too long (${voice.duration}s). Max ${MAX_VOICE_SECONDS}s.`);
      return;
    }

    deps.users.upsert(userId, ctx.from?.username ?? null);
    deps.audit.log(userId, "voice_message");

    await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    try {
      // Download voice file
      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) {
        await ctx.reply("Failed to download voice.");
        return;
      }
      const buf = Buffer.from(await res.arrayBuffer());

      // Transcribe
      const transcript = await deps.stt.transcribe(buf, "ogg");
      if (!transcript?.text) {
        await ctx.reply("Could not transcribe. Try again.");
        return;
      }

      log.info({ userId, chars: transcript.text.length, lang: transcript.language }, "Voice transcribed");

      // Show transcript
      await ctx.reply(`🎤 _${escMd(transcript.text)}_`, { parse_mode: "Markdown" });

      // Validate
      const check = validator.validateInput(transcript.text);
      if (!check.valid) {
        await ctx.reply(check.reason ?? "Input rejected.");
        return;
      }

      // Process through Claude (same as text messages)
      let prompt = deps.systemPrompt;
      if (deps.memory) {
        const mem = deps.memory.loadMemoryFile(userId);
        const daily = deps.memory.getDailyNote(userId);
        if (mem) prompt += `\n\n---\n\n# Memory\n${mem}`;
        if (daily) prompt += `\n\n---\n\n# Today\n${daily}`;
      }
      prompt = truncateSystemPrompt(prompt);

      await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

      const response = await deps.claude.runCommand(
        transcript.text,
        userId,
        deps.approvedDirectory,
        { systemPrompt: prompt },
      );

      const reply = response.content || "(No response)";

      // Send text reply
      await ctx.reply(reply, { parse_mode: "Markdown" }).catch(() => ctx.reply(reply));

      // Send voice reply if TTS is available
      if (deps.tts && reply.length < 4000) {
        await ctx.api.sendChatAction(chatId, "record_voice").catch(() => {});
        const ttsResult = await deps.tts.synthesize(reply);
        if (ttsResult) {
          await ctx.replyWithVoice(new InputFile(ttsResult.audio, "reply.ogg"), {
            duration: ttsResult.durationSec,
          });
        }
      }
    } catch (err) {
      log.error({ userId, error: err instanceof Error ? err.message : err }, "Voice failed");
      await ctx.reply("Voice processing failed. Try again.");
    }
  };
}

function escMd(t: string): string {
  return t.replace(/([*_`\[])/g, "\\$1").slice(0, 500);
}
