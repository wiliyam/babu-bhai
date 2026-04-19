# Soulcast

**Open-source AI agent gateway for Telegram.** Control Claude Code from your phone — with persistent memory, bot identity, and conversation continuity.

Built with **Bun + TypeScript**. Inspired by OpenClaw. Secure by default.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](tsconfig.json)
[![Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)

---

## Why Soulcast?

Most Claude Code Telegram wrappers are either broken, Python-based, or have no identity system. Soulcast takes the best ideas from OpenClaw and rebuilds them in TypeScript/Bun:

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
| **First-Chat Onboarding** | Pick a personality (Jarvis, Sherlock, Gandalf, etc.) via inline buttons |
| **Voice Chat** | Send voice messages — transcribed via Groq Whisper, replies with Edge TTS voice ($0/mo) |
| **File Uploads** | Send documents, photos, videos — Claude reads and analyzes them |
| **Live Streaming Updates** | See tools being used in real-time (📖 Read, 💻 Bash, 🔧 Edit) |
| **Scheduled Tasks** | Cron jobs with natural language ("every day at 9am") + session isolation |
| **Session Continuity** | Auto-resumes Claude sessions with `--resume` for multi-turn conversations |
| **Conversation Memory** | Recent messages injected as context when sessions expire |
| **Persistent Memory** | Per-user `/remember` and `/memory` with SQLite + Markdown storage |
| **Interactive Setup** | `bun setup` wizard — no manual `.env` editing |
| **Secure by Default** | User whitelist required, input sanitization, prompt injection prevention |
| **Rate Limiting** | Token bucket per user + global concurrent request cap (5 max) |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- [Claude Code](https://claude.ai/code) installed and logged in (`claude login`)
- Telegram account

### Install

```bash
git clone https://github.com/wiliyam/soulcast.git
cd soulcast
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
    → Route by type:
      ├─ Text → Message handler → Claude SDK
      ├─ Voice → STT (Groq Whisper) → Claude SDK → TTS (Edge) → Voice reply
      ├─ File → Download → Save → Claude analyzes file
      └─ Command → /start, /new, /memory, /personality, etc.
    → Claude SDK:
      → Load identity: Core Identity → SOUL.md → Telegram Rules → CLAUDE.md
      → Load memory: per-user MEMORY.md + recent messages
      → Spawn: claude --print --resume <sessionId> --system-prompt <identity+memory>
      → Stream JSON events → Live updates to Telegram (📖 Read, 💻 Bash, 🔧 Edit)
    → Send final response to Telegram
```

### Identity System (OpenClaw-Style)

The system prompt is assembled in strict order — identity FIRST, project context LAST:

1. **Core Identity** — "You are a personal AI assistant running inside Soulcast. You are NOT Claude."
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

Your bot's personality lives in `.soulcast/` inside your project directory:

```
.soulcast/
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

## Voice Chat

Send a voice message to the bot — it transcribes, processes through Claude, and replies with both text and a voice message.

| Component | Provider | Cost |
|---|---|---|
| **Speech-to-Text** | [Groq Whisper](https://console.groq.com) | Free (14.4k req/day) |
| **Text-to-Speech** | [Microsoft Edge TTS](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/) | Free (no API key) |

Personality → voice mapping:

| Personality | Voice |
|---|---|
| Jarvis | `en-GB-RyanNeural` (British, polished) |
| Sherlock | `en-GB-ThomasNeural` (British, analytical) |
| Gandalf | `en-US-GuyNeural` (warm, deep) |
| Tony Stark | `en-US-JasonNeural` (confident) |
| Wednesday | `en-US-JennyNeural` (cool, deadpan) |
| Morgan Freeman | `en-US-DavisNeural` (narrative) |

Requires: `GROQ_API_KEY` (free from console.groq.com) + ffmpeg installed on server.

---

## File Uploads

Send any file to the bot — it saves it and tells Claude to analyze it.

| Type | Supported |
|---|---|
| **Documents** | PDF, JSON, CSV, TXT, code files, archives |
| **Photos** | JPG, PNG, WebP, GIF |
| **Videos** | MP4 |
| **Stickers** | WebP |

- Add a **caption** to tell Claude what to do: "fix the bug in this file", "summarize this PDF"
- Files saved to `.soulcast/uploads/` — auto-cleaned (keeps last 20)
- Max file size: 20MB (Telegram limit)

---

## Scheduled Tasks

Set up cron jobs that run Claude in isolated sessions.

**Natural language:**
```
/schedule every day at 9am — check git status and summarize changes
/schedule every monday at 10:30 — run tests and report failures
/schedule every 15 minutes — check server health
```

**Raw cron:**
```
/schedule 0 9 * * * — daily standup summary
```

Each scheduled run uses a **fresh Claude session** — no pollution of your interactive conversation.

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
| `GROQ_API_KEY` | No | — | Free key from [console.groq.com](https://console.groq.com) for voice STT |
| `VOICE_ENABLED` | No | `true` | Enable voice messages (STT + TTS) |
| `TTS_VOICE` | No | `en-US-AndrewNeural` | Edge TTS voice (see [voice list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)) |
| `ENABLE_SCHEDULER` | No | `false` | Enable cron job scheduler |
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
git clone https://github.com/wiliyam/soulcast.git
cd soulcast
bun install
bun setup

# Create systemd service
sudo tee /etc/systemd/system/soulcast.service << 'EOF'
[Unit]
Description=Soulcast AI Agent
After=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/soulcast
ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/ubuntu/soulcast/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable soulcast
sudo systemctl start soulcast

# Check logs
sudo journalctl -u soulcast -f
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
      message.ts            # Agentic message handler + live streaming
      voice.ts              # Voice message handler (STT → Claude → TTS)
      file.ts               # File upload handler (save + analyze)
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
  voice/
    stt.ts                  # Groq Whisper speech-to-text (free)
    tts.ts                  # Edge TTS text-to-speech (free)
  scheduler/
    runner.ts               # Cron job runner with session isolation
    parser.ts               # Natural language → cron expression
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

**Stack:** Bun, TypeScript (strict), grammY, Zod, Bun SQLite, pino, croner, nanoid, msedge-tts

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
- [x] Voice chat — STT (Groq Whisper, free) + TTS (Edge, free) with personality voices
- [x] Scheduled tasks (cron) with natural language parsing + session isolation
- [x] File uploads — documents, photos, videos analyzed by Claude
- [x] Live streaming updates — see tools being used in real-time
- [ ] Skill/plugin system (community extensions)
- [ ] Webhook support (GitHub, generic)
- [ ] Multi-project support (switch between projects)
- [ ] Web dashboard
- [ ] Multi-channel (Slack, Discord)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```bash
# Quick start
git clone https://github.com/YOUR_USERNAME/soulcast.git
cd soulcast
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

- [Issues](https://github.com/wiliyam/soulcast/issues) — Bug reports and feature requests
- [Discussions](https://github.com/wiliyam/soulcast/discussions) — Questions and ideas
- [Security](SECURITY.md) — Vulnerability reporting

---

## License

[MIT](LICENSE) — open source forever.

---

Built with Bun, TypeScript, and Claude. Inspired by [OpenClaw](https://github.com/openclaw/openclaw).
