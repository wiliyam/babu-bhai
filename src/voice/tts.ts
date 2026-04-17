/**
 * Text-to-Speech via Microsoft Edge's free TTS service.
 *
 * No API key. Uses the same endpoint Edge's Read Aloud uses.
 * Output: OGG/Opus for Telegram voice messages.
 */
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("tts");

const MAX_TEXT_CHARS = 4000;

export interface TtsResult {
  audio: Buffer;
  durationSec: number;
}

/** Personality → Edge TTS voice mapping */
export const VOICE_MAP: Record<string, string> = {
  jarvis: "en-GB-RyanNeural",
  sherlock: "en-GB-ThomasNeural",
  gandalf: "en-US-GuyNeural",
  yoda: "en-US-ChristopherNeural",
  tony_stark: "en-US-JasonNeural",
  wednesday: "en-US-JennyNeural",
  morgan_freeman: "en-US-DavisNeural",
  professional: "en-US-AndrewNeural",
  custom: "en-US-AndrewNeural",
  default: "en-US-AndrewNeural",
};

export class TextToSpeech {
  private readonly voice: string;

  constructor(voice?: string) {
    this.voice = voice || VOICE_MAP.default;
    log.info({ voice: this.voice }, "TTS ready (Edge)");
  }

  async synthesize(text: string): Promise<TtsResult | null> {
    const trimmed = text.trim().slice(0, MAX_TEXT_CHARS);
    if (!trimmed) return null;
    const started = Date.now();

    const id = nanoid(10);
    const mp3Path = join(tmpdir(), `babu-tts-${id}.mp3`);
    const oggPath = join(tmpdir(), `babu-tts-${id}.ogg`);

    try {
      // Use edge-tts CLI (installed via: bun add msedge-tts)
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
      const tts = new MsEdgeTTS();
      await tts.setMetadata(this.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

      const mp3Chunks: Buffer[] = [];
      const stream = tts.toStream(trimmed);

      await new Promise<void>((resolve, reject) => {
        const s = stream as any;
        const audioStream = s.audioStream ?? s;
        audioStream.on("data", (chunk: Buffer) => mp3Chunks.push(chunk));
        audioStream.on("end", () => resolve());
        audioStream.on("error", (err: Error) => reject(err));
      });

      const mp3 = Buffer.concat(mp3Chunks);
      await writeFile(mp3Path, mp3);

      // Convert MP3 → OGG/Opus (Telegram voice format)
      const ffmpeg = Bun.spawn(
        ["ffmpeg", "-y", "-i", mp3Path, "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-application", "voip", oggPath],
        { stdout: "ignore", stderr: "ignore" },
      );
      const ffmpegExit = await ffmpeg.exited;
      if (ffmpegExit !== 0) {
        log.error("ffmpeg OGG conversion failed");
        return null;
      }

      const ogg = await Bun.file(oggPath).arrayBuffer();
      const buf = Buffer.from(ogg);
      const durationSec = Math.max(1, Math.round((Date.now() - started) / 1000));

      log.info({ chars: trimmed.length, bytes: buf.length, ms: Date.now() - started }, "Synthesized");
      return { audio: buf, durationSec };
    } catch (err) {
      log.error({ error: err instanceof Error ? err.message : err }, "TTS failed");
      return null;
    } finally {
      await unlink(mp3Path).catch(() => {});
      await unlink(oggPath).catch(() => {});
    }
  }
}
