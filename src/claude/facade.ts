import type { MessageRepository } from "../storage/repositories.js";
import { createChildLogger } from "../utils/logger.js";
import type { ClaudeResponse, ClaudeSDK, StreamUpdate } from "./sdk.js";
import type { SessionManager } from "./session.js";

const log = createChildLogger("claude");

// Max recent messages to inject as conversation context
const MAX_CONTEXT_MESSAGES = 10;

export class ClaudeIntegration {
  constructor(
    private sdk: ClaudeSDK,
    private sessions: SessionManager,
    private messages: MessageRepository,
  ) {}

  async runCommand(
    prompt: string,
    userId: number,
    projectPath: string,
    options: {
      systemPrompt?: string;
      onStream?: (update: StreamUpdate) => void;
    } = {},
  ): Promise<ClaudeResponse> {
    const session = await this.sessions.getOrCreate(userId, projectPath);

    log.info(
      {
        userId,
        sessionId: session.id,
        isNew: session.isNew,
        claudeSessionId: session.claudeSessionId ?? "none",
      },
      "Running command",
    );

    // Build enhanced prompt with conversation context
    let enhancedPrompt = prompt;
    let systemPrompt = options.systemPrompt ?? "";

    // If no Claude session to resume, inject recent conversation history
    // This gives the bot "memory" even when sessions expire
    if (!session.claudeSessionId) {
      const recentMessages = this.messages.findBySession(session.id, MAX_CONTEXT_MESSAGES);
      if (recentMessages.length > 0) {
        const history = recentMessages
          .reverse()
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
          .join("\n\n");

        systemPrompt += `\n\n## Recent Conversation History\n\nThis is your recent conversation with this user. Use it for context:\n\n${history}`;
        log.debug({ messageCount: recentMessages.length }, "Injected conversation history");
      }
    }

    // Execute via SDK with session resume
    let response = await this.sdk.execute(prompt, projectPath, {
      sessionId: session.claudeSessionId ?? undefined,
      systemPrompt,
      onStream: options.onStream,
    });

    // If resume failed (empty response or error), retry without resume
    if (session.claudeSessionId && (response.isError || !response.content)) {
      log.warn({ claudeSessionId: session.claudeSessionId }, "Session resume failed, starting fresh");
      this.sessions.resetSession(userId, projectPath);
      const freshSession = await this.sessions.getOrCreate(userId, projectPath);

      // Inject conversation history for context
      const recentMessages = this.messages.findBySession(session.id, MAX_CONTEXT_MESSAGES);
      if (recentMessages.length > 0) {
        const history = recentMessages
          .reverse()
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
          .join("\n\n");

        systemPrompt = (options.systemPrompt ?? "") +
          `\n\n## Recent Conversation History\n\n${history}`;
      }

      response = await this.sdk.execute(prompt, projectPath, {
        systemPrompt,
        onStream: options.onStream,
      });

      if (response.sessionId) {
        this.sessions.assignClaudeSession(freshSession.id, response.sessionId);
      }
      this.sessions.recordTurn(freshSession.id, response.cost);
    } else {
      if (response.sessionId && response.sessionId !== session.claudeSessionId) {
        this.sessions.assignClaudeSession(session.id, response.sessionId);
      }
      this.sessions.recordTurn(session.id, response.cost);
    }

    // Store messages for future context injection
    this.messages.create({
      sessionId: session.id,
      userId,
      role: "user",
      content: prompt,
      cost: 0,
      durationMs: 0,
      toolsUsed: [],
    });

    this.messages.create({
      sessionId: session.id,
      userId,
      role: "assistant",
      content: response.content,
      cost: response.cost,
      durationMs: response.durationMs,
      toolsUsed: response.toolsUsed,
    });

    return response;
  }

  resetSession(userId: number, projectPath: string): void {
    this.sessions.resetSession(userId, projectPath);
  }
}
