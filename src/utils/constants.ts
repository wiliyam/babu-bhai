export const VERSION = "0.1.0";
export const APP_NAME = "Soulcast";

// Telegram limits
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
export const TELEGRAM_RATE_LIMIT_PER_CHAT_MS = 1100;

// Tool display icons
export const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Write: "✏️",
  Edit: "🔧",
  Bash: "💻",
  Glob: "🔍",
  Grep: "🔎",
  WebFetch: "🌐",
  WebSearch: "🔍",
  TodoWrite: "📋",
  Agent: "🤖",
};

// Session
export const SESSION_TIMEOUT_HOURS = 24;
export const MAX_SESSIONS_PER_USER = 5;
