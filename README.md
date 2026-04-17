# Babu Bhai

**Open-source AI agent gateway for Telegram.** Control Claude Code from your phone — with persistent memory, bot identity, and conversation continuity.

Built with **Bun + TypeScript**. Inspired by OpenClaw. Secure by default.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](tsconfig.json)
[![Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)

---

## Why Babu Bhai?

Most Claude Code Telegram wrappers are either broken, Python-based, or have no identity system. Babu Bhai takes the best ideas from OpenClaw and rebuilds them in TypeScript/Bun:

| vs | Advantage |
|---|---|
| **OpenClaw** | Pure TS/Bun, simpler setup, no grammy dependency crashes |
| **claude-code-telegram** | Not Python — 3x faster startup, native SQLite, typed end-to-end |
| **Claude Code Channels** | No `channelsEnabled` org policy restriction, works on Claude Max |

---

## Features

| Feature | Description |
|---|---|
| **Full Claude Code Access** | Read, write, edit files, run bash, git — all from Telegram |
| **OpenClaw-Style Identity** | SOUL.md personality system — bot knows who it is, never says "I'm Claude" |
| **First-Chat Onboarding** | New users pick a personality (Jarvis, Sherlock, Gandalf, etc.) via inline buttons |
| **Session Continuity** | Auto-resumes Claude sessions with `--resume` for multi-turn conversations |
| **Conversation Memory** | Recent messages injected as context when sessions expire |
| **Persistent Memory** | Per-user `/remember` and `/memory` with SQLite + Markdown storage |
| **Interactive Setup** | `bun setup` wizard — no manual `.env` editing |
| **Secure by Default** | User whitelist required, input sanitization, prompt injection prevention |
| **Rate Limiting** | Token bucket per user + global concurrent request cap (5 max) |
| **Typing Indicator** | Shows "typing..." while Claude works |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- [Claude Code](https://claude.ai/code) installed and logged in (`claude login`)
- Telegram account

### Install

```bash
git clone https://github.com/wiliyam/babu-bhai.git
cd babu-bhai
bun install
```

### Option A: Interactive Setup (Recommended)

```bash
bun setup
```

The wizard asks for everything — bot token, user ID, project directory, model, personality.

### Option B: Manual Setup

```bash
cp .env.example .env
# Edit .env with your values
```

### Run

```bash
bun start
```

Then message your bot on Telegram!

### First Message

When you message the bot for the first time, it runs onboarding:

1. Asks your name
2. Shows personality presets via inline buttons:
   - **Jarvis** (Iron Man) — Witty, polished AI butler
   - **Sherlock Holmes** — Deductive, blunt analysis
   - **Gandalf** — Wise, guides rather than dictates
   - **Tony Stark** — Sarcastic, builds fast
   - **Wednesday Addams** — Deadpan, brutally honest
   - **Morgan Freeman** — Calm narrator
   - **Master Yoda** — Inverted speech, teaches through questions
   - **Custom** — Write your own personality
3. Saves `SOUL.md` and starts working

Change personality anytime with `/personality`.

---

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome / trigger onboarding |
| `/new` | Reset session (fresh context) |
| `/status` | Session info |
| `/memory [query]` | Search or list stored memories |
| `/remember <text>` | Save something to memory |
| `/personality` | Change bot personality |
| `/help` | All commands |

**Any other text message** goes to Claude Code as a prompt.

---

## How It Works

```
You (Telegram)
  → grammY Bot receives message
    → Auth middleware (user whitelist check)
    → Rate limiter (10 req/min per user)
    → Input validator (length + sanitization)
    → Message handler
      → Load identity: Core Identity → SOUL.md → Telegram Rules → CLAUDE.md
      → Load memory: per-user MEMORY.md + daily notes + recent messages
      → Spawn: claude --print --resume <sessionId> --system-prompt <identity+memory>
      → Stream JSON response
      → Parse result events
    → Send response back to Telegram
```

### Identity System (OpenClaw-Style)

The system prompt is assembled in strict order — identity FIRST, project context LAST:

1. **Core Identity** — "You are a personal AI assistant running inside Babu Bhai. You are NOT Claude."
2. **SOUL.md** — Your chosen personality
3. **IDENTITY.md** — Name, metadata
4. **Telegram Rules** — Keep it short, don't narrate, understand follow-ups
5. **CLAUDE.md** — Project-specific context

This ordering ensures the bot firmly identifies as your named assistant, not raw Claude Code.

### Session Continuity

- **Within a session:** `--resume <sessionId>` gives full conversation history
- **Across sessions:** Last 10 messages injected into system prompt as context
- **Persistent memory:** `/remember` saves facts to SQLite + Markdown (survives everything)

---

## Bot Identity (SOUL.md)

Your bot's personality lives in `.babu-bhai/` inside your project directory:

```
.babu-bhai/
  SOUL.md          # Personality, thinking style, rules
  IDENTITY.md      # Name, metadata
  data.db          # SQLite (sessions, messages, memory, audit)
  memory/
    <userId>/
      MEMORY.md    # Per-user persistent facts
      2026-04-17.md  # Daily conversation notes
```

Edit `SOUL.md` anytime to change personality. Changes take effect on next message.

---

## Memory System

Per-user, persistent, searchable. Sanitized against prompt injection.

| Method | Example |
|---|---|
| **Natural language** | "remember that the deploy key is in vault" |
| **Command** | `/remember API rate limit is 100 req/min` |
| **Search** | `/memory deploy key` |
| **List recent** | `/memory` |

Storage: SQLite (searchable) + per-user Markdown files (human-readable).

---

## Configuration

All settings via environment variables (or `bun setup`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** | — | From @BotFather |
| `TELEGRAM_BOT_USERNAME` | **Yes** | — | Without @ |
| `APPROVED_DIRECTORY` | **Yes** | — | Base directory for file access |
| `ALLOWED_USERS` | **Yes** | — | Comma-separated Telegram user IDs |
| `CLAUDE_MODEL` | No | `default` | Claude model (or "default" for latest) |
| `CLAUDE_MAX_TURNS` | No | `10` | Max tool-use turns per message |
| `CLAUDE_TIMEOUT_SECONDS` | No | `300` | Timeout per message |
| `ENABLE_MEMORY` | No | `true` | Enable memory system |
| `LOG_LEVEL` | No | `info` | debug/info/warn/error |
| `RATE_LIMIT_REQUESTS` | No | `10` | Max messages per minute per user |

---

## Security

Secure by default — no opt-in required.

| Layer | Protection |
|---|---|
| **Authentication** | User whitelist required — no open access mode |
| **Input validation** | 2000 char limit, content sanitization |
| **Memory sanitization** | Prompt injection patterns stripped before storage |
| **Directory isolation** | Claude restricted to `APPROVED_DIRECTORY` |
| **Error handling** | Internal errors never leak to Telegram users |
| **Rate limiting** | 10 req/min per user, 5 max global concurrent |
| **Session validation** | IDs format-checked before passing to CLI |
| **Audit logging** | All actions logged to SQLite |
| **System prompt cap** | 50KB max to prevent DoS via memory growth |

See [SECURITY.md](SECURITY.md) for full policy and vulnerability reporting.

---

## Deploy to Server

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install Claude Code and authenticate
npm install -g @anthropic-ai/claude-code
claude login

# Clone and setup
git clone https://github.com/wiliyam/babu-bhai.git
cd babu-bhai
bun install
bun setup

# Create systemd service
sudo tee /etc/systemd/system/babu-bhai.service << 'EOF'
[Unit]
Description=Babu Bhai AI Agent
After=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/babu-bhai
ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/ubuntu/babu-bhai/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable babu-bhai
sudo systemctl start babu-bhai

# Check logs
sudo journalctl -u babu-bhai -f
```

---

## Project Structure

```
src/
  index.ts                  # Entry + auto-setup trigger
  setup/wizard.ts           # Interactive first-run wizard
  config/
    schema.ts               # Zod-validated settings
    loader.ts               # Env loader
  bot/
    core.ts                 # grammY bot + middleware chain
    handlers/
      command.ts            # /start, /new, /status, /memory, /help
      message.ts            # Agentic message handler
      onboarding.ts         # First-chat personality picker
    middleware/
      auth.ts               # User whitelist
      rateLimit.ts          # Token bucket
  claude/
    sdk.ts                  # Claude CLI subprocess (stream-json)
    session.ts              # Session persistence + auto-resume
    facade.ts               # High-level integration + conversation history
  identity/
    loader.ts               # OpenClaw-style prompt assembly
  memory/
    store.ts                # Per-user MEMORY.md + SQLite
  storage/
    database.ts             # Bun SQLite + migrations
    models.ts               # TypeScript interfaces
    repositories.ts         # Data access layer
  events/
    bus.ts                  # Async pub/sub
  notifications/
    service.ts              # Rate-limited Telegram delivery
  security/
    auth.ts                 # Auth manager
    validator.ts            # Input sanitization, session ID validation
```

**Stack:** Bun, TypeScript (strict), grammY, Zod, Bun SQLite, pino, croner, nanoid

---

## Roadmap

- [x] Core bot with Claude Code integration
- [x] Session persistence with `--resume` and auto-retry
- [x] OpenClaw-style identity (SOUL.md + IDENTITY.md, identity-first prompt assembly)
- [x] First-chat onboarding with personality presets (Jarvis, Sherlock, etc.)
- [x] Conversation memory (recent messages injected across session boundaries)
- [x] Persistent per-user memory (`/remember`, `/memory`)
- [x] Interactive setup wizard (`bun setup`)
- [x] Security hardening (5-layer defense, 3 CRITICAL + 5 HIGH fixed)
- [ ] Voice chat (Edge TTS + Groq Whisper — $0/mo)
- [ ] Scheduled tasks (cron) with session isolation
- [ ] Skill/plugin system (community extensions)
- [ ] Webhook support (GitHub, generic)
- [ ] Image/file upload handling
- [ ] Multi-project support
- [ ] Web dashboard
- [ ] Multi-channel (Slack, Discord)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```bash
# Quick start
git clone https://github.com/YOUR_USERNAME/babu-bhai.git
cd babu-bhai
bun install
bun setup
bun dev         # Auto-reload on changes
bun typecheck   # Must pass
bun lint        # Must pass
```

**Commit format:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community guidelines.

---

## Community

- [Issues](https://github.com/wiliyam/babu-bhai/issues) — Bug reports and feature requests
- [Discussions](https://github.com/wiliyam/babu-bhai/discussions) — Questions and ideas
- [Security](SECURITY.md) — Vulnerability reporting

---

## License

[MIT](LICENSE) — open source forever.

---

Built with Bun, TypeScript, and Claude. Inspired by [OpenClaw](https://github.com/openclaw/openclaw).
