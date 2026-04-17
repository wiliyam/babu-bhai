import { isValidSessionId, truncateSystemPrompt } from "../security/validator.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("claude-sdk");

export interface ClaudeResponse {
  content: string;
  sessionId: string | null;
  cost: number;
  toolsUsed: string[];
  durationMs: number;
  isError: boolean;
}

export interface StreamUpdate {
  type: "tool_start" | "tool_end" | "text" | "thinking" | "error";
  toolName?: string;
  content?: string;
}

/**
 * Claude Code SDK integration via subprocess.
 *
 * Spawns `claude` CLI in JSON streaming mode and parses events.
 * This is the official way to integrate with Claude Code programmatically.
 */
export class ClaudeSDK {
  constructor(
    private model: string,
    private maxTurns: number,
    private timeoutSeconds: number,
  ) {
    log.info({ model, maxTurns, timeoutSeconds }, "Claude SDK initialized");
  }

  async execute(
    prompt: string,
    workingDirectory: string,
    options: {
      sessionId?: string;
      systemPrompt?: string;
      onStream?: (update: StreamUpdate) => void;
    } = {},
  ): Promise<ClaudeResponse> {
    const startTime = Date.now();
    const toolsUsed: string[] = [];

    try {
      const args = [
        "--print",
        "--output-format", "stream-json",
        "--max-turns", String(this.maxTurns),
        "--model", this.model,
      ];

      // SECURITY: Validate session ID format before passing to CLI
      if (options.sessionId && isValidSessionId(options.sessionId)) {
        args.push("--resume", options.sessionId);
      }

      // SECURITY: Truncate system prompt to prevent ARG_MAX overflow
      if (options.systemPrompt) {
        args.push("--system-prompt", truncateSystemPrompt(options.systemPrompt));
      }

      args.push("--", prompt);

      const proc = Bun.spawn(["claude", ...args], {
        cwd: workingDirectory,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      let resultText = "";
      let sessionId: string | null = null;
      let totalCost = 0;

      // Read streaming JSON output line by line
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);

            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") {
                  resultText = block.text;
                  options.onStream?.({ type: "text", content: block.text });
                } else if (block.type === "tool_use") {
                  toolsUsed.push(block.name);
                  options.onStream?.({
                    type: "tool_start",
                    toolName: block.name,
                  });
                }
              }
            } else if (event.type === "result") {
              resultText = event.result ?? resultText;
              sessionId = event.session_id ?? null;
              totalCost = event.cost_usd ?? 0;
            }
          } catch {
            // Not JSON — might be plain text output
            if (line.trim()) {
              resultText += line;
            }
          }
        }
      }

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        log.warn({ exitCode, stderr: stderr.slice(0, 500) }, "Claude exited with error");
        if (!resultText) {
          resultText = stderr || `Claude exited with code ${exitCode}`;
        }
      }

      return {
        content: resultText,
        sessionId,
        cost: totalCost,
        toolsUsed: [...new Set(toolsUsed)],
        durationMs: Date.now() - startTime,
        isError: exitCode !== 0,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      log.error({ error: message }, "Claude SDK execution failed");

      return {
        content: `Error: ${message}`,
        sessionId: null,
        cost: 0,
        toolsUsed,
        durationMs: Date.now() - startTime,
        isError: true,
      };
    }
  }
}
