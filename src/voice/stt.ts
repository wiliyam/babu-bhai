/**
 * Speech-to-Text via Groq Whisper (free tier).
 *
 * Groq: free tier 14.4k req/day, ~100x real-time.
 * Get a free key at console.groq.com.
 */
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("stt");

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface SttResult {
  text: string;
  language?: string;
  durationMs: number;
}

export class SpeechToText {
  private apiKey: string | null;
  private readonly model: string;

  constructor(apiKey: string | undefined, model = "whisper-large-v3-turbo") {
    this.apiKey = apiKey ?? null;
    this.model = model;
    if (this.apiKey) {
      log.info({ model }, "STT ready (Groq Whisper)");
    } else {
      log.warn("STT disabled: GROQ_API_KEY not set");
    }
  }

  get enabled(): boolean {
    return this.apiKey !== null;
  }

  async transcribe(audio: Buffer, sourceExt = "ogg"): Promise<SttResult | null> {
    if (!this.apiKey) return null;
    const started = Date.now();

    const id = nanoid(10);
    const inPath = join(tmpdir(), `babu-stt-${id}.${sourceExt}`);
    const outPath = join(tmpdir(), `babu-stt-${id}.mp3`);

    try {
      await writeFile(inPath, audio);

      // Convert to mp3 via ffmpeg
      const ffmpeg = Bun.spawn(
        ["ffmpeg", "-y", "-i", inPath, "-ar", "16000", "-ac", "1", "-b:a", "64k", outPath],
        { stdout: "ignore", stderr: "ignore" },
      );
      const ffmpegExit = await ffmpeg.exited;
      if (ffmpegExit !== 0) {
        log.error("ffmpeg conversion failed");
        return null;
      }

      const mp3File = Bun.file(outPath);
      if (mp3File.size > MAX_AUDIO_BYTES) {
        log.warn({ size: mp3File.size }, "Audio too large");
        return null;
      }

      // Call Groq Whisper API directly (no SDK needed)
      const formData = new FormData();
      formData.append("file", new File([await mp3File.arrayBuffer()], `audio.mp3`, { type: "audio/mpeg" }));
      formData.append("model", this.model);
      formData.append("response_format", "verbose_json");
      formData.append("temperature", "0");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
      });

      if (!res.ok) {
        log.error({ status: res.status }, "Groq API error");
        return null;
      }

      const data = (await res.json()) as { text?: string; language?: string };
      const text = data.text?.trim() ?? "";
      const durationMs = Date.now() - started;

      log.info({ chars: text.length, language: data.language, durationMs }, "Transcribed");
      return { text, language: data.language, durationMs };
    } catch (err) {
      log.error({ error: err instanceof Error ? err.message : err }, "STT failed");
      return null;
    } finally {
      await unlink(inPath).catch(() => {});
      await unlink(outPath).catch(() => {});
    }
  }
}
