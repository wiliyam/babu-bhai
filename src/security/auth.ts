import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("auth");

export class AuthManager {
  private allowedUsers: Set<number>;
  private sessions: Map<number, { expiresAt: number }> = new Map();
  private sessionTtlMs = 24 * 60 * 60 * 1000; // 24h

  constructor(allowedUserIds: number[]) {
    this.allowedUsers = new Set(allowedUserIds);
    log.info(
      { userCount: allowedUserIds.length },
      "Auth manager initialized",
    );
  }

  authenticate(userId: number): boolean {
    // SECURITY: Never allow open access. ALLOWED_USERS is required.
    if (this.allowedUsers.size === 0) {
      log.error("No allowed users configured. Denying all access.");
      return false;
    }

    if (this.allowedUsers.has(userId)) {
      this.createSession(userId);
      return true;
    }

    log.warn({ userId }, "Authentication denied");
    return false;
  }

  isAuthenticated(userId: number): boolean {
    const session = this.sessions.get(userId);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(userId);
      return false;
    }
    return true;
  }

  refreshSession(userId: number): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.expiresAt = Date.now() + this.sessionTtlMs;
    }
  }

  private createSession(userId: number): void {
    this.sessions.set(userId, {
      expiresAt: Date.now() + this.sessionTtlMs,
    });
  }
}
