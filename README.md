# Babu Bhai

**Open-source AI agent gateway for Telegram.** Control Claude Code from your phone — with persistent memory, bot identity, and scheduled tasks.

Built with **Bun + TypeScript**. Zero Python. Zero bloat. Secure by default.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](tsconfig.json)
[![Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)

---

## Why Babu Bhai?

| vs | Advantage |
|---|---|
| **OpenClaw** | Pure TS/Bun (not Node.js), built-in memory, no grammy crashes |
| **claude-code-telegram** | Not Python — 3x faster startup, native SQLite, typed end-to-end |
| **Claude Code Channels** | No `channelsEnabled` org policy restriction, works on any plan |

---

## Features

| Feature | Description |
|---|---|
| **Full Claude Code Access** | Read, write, edit files, run bash, git — all from Telegram |
| **Interactive Setup** | `bun setup` — wizard asks for everything, no manual .env editing |
| **Session Persistence** | Auto-resumes conversations across restarts (Bun SQLite) |
| **Bot Identity** | SOUL.md + IDENTITY.md personality system (OpenClaw-style) |
| **Persistent Memory** | Per-user memories — facts, preferences, decisions |
| **Memory Search** | `/memory deploy key` — keyword search across stored memories |
| **Caveman Mode** | 60-75% output token reduction — built in, configurable |
| **Secure by Default** | User whitelist required, input sanitization, prompt injection prevention |
| **Rate Limiting** | Token bucket per user + global concurrent request cap |
| **Typing Indicator** | Shows "typing..." while Claude works |
| **Auto-Memory** | Extracts "remember that..." patterns from conversations |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- [Claude Code](https://claude.ai/code) installed and logged in (`claude login`)
- Telegram account

### Install and Setup

```bash
git clone https://github.com/wiliyam/babu-bhai.git
cd babu-bhai
bun install
bun setup
```

The setup wizard walks you through everything:

```
╔══════════════════════════════════════╗
║       🤖 Babu Bhai Setup Wizard      ║
╚══════════════════════════════════════╝

── Step 1: Telegram Bot ──
Paste your Telegram bot token: ***
Bot username (without @): MyBot

── Step 2: Your Telegram ID ──
Your Telegram user ID(s): 123456789

── Step 3: Project Directory ──
Approved directory path [/home]: /home/user/projects

── Step 4: Claude Model ──
Claude model [claude-sonnet-4-6]:

── Step 5: Token Savings (Caveman) ──
Default caveman mode [full]:

── Step 6: Bot Personality ──
Bot display name [Babu Bhai]:
Use default personality? (y/n) [y]:

✅ Setup Complete!
```

### Run

```bash
bun start
```

Then message your bot on Telegram!

---

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/new` | Reset session (fresh context) |
| `/status` | Session info and cost |
| `/memory [query]` | Search or list stored memories |
| `/remember <text>` | Save something to memory |
| `/help` | All commands |

Any other text message is sent to Claude Code as a prompt.

---

## Bot Identity (SOUL.md)

Give your bot a personality. The setup wizard creates these in `.babu-bhai/`:

```
.babu-bhai/
  SOUL.md          # Personality, thinking style, rules
  IDENTITY.md      # Name, metadata
  memory/
    <userId>/
      MEMORY.md    # Per-user persistent facts
      2026-04-17.md  # Daily notes
```

**Example SOUL.md:**

```markdown
# Babu Bhai

You are Babu Bhai, a senior full-stack developer.
You speak concisely and prefer action over discussion.
You never commit without asking first.

## Rules
- Always read the file before editing
- Use conventional commits
- Run tests after code changes
```

---

## Memory System

Per-user, persistent, searchable.

| Method | Example |
|---|---|
| **Natural language** | "remember that the deploy key is in vault" |
| **Command** | `/remember API rate limit is 100 req/min` |
| **Search** | `/memory deploy key` |
| **List recent** | `/memory` |

Memories are stored in SQLite (searchable) + Markdown files (human-readable). Content is **sanitized** before storage to prevent prompt injection.

---

## Caveman Mode (Token Savings)

Built-in [Caveman](https://github.com/juliusbrussee/caveman) integration reduces output tokens by 60-75%.

| Mode | Savings | Style |
|---|---|---|
| `off` | 0% | Normal verbose responses |
| `lite` | ~40% | Concise, proper grammar |
| `full` | ~65% | Terse fragments, no filler |
| `ultra` | ~75% | Telegraphic, maximum compression |

Set in `.env` or during `bun setup`:

```env
CAVEMAN_MODE=full
```

---

## Configuration

All settings via environment variables (or `bun setup`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** | — | From @BotFather |
| `TELEGRAM_BOT_USERNAME` | **Yes** | — | Without @ |
| `APPROVED_DIRECTORY` | **Yes** | — | Base directory for file access |
| `ALLOWED_USERS` | **Yes** | — | Comma-separated Telegram user IDs |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-6` | Claude model |
| `CLAUDE_MAX_TURNS` | No | `10` | Max tool-use turns per message |
| `CLAUDE_TIMEOUT_SECONDS` | No | `300` | Timeout per message |
| `CAVEMAN_MODE` | No | `full` | Token savings: off/lite/full/ultra |
| `ENABLE_MEMORY` | No | `true` | Enable memory system |
| `LOG_LEVEL` | No | `info` | debug/info/warn/error |
| `RATE_LIMIT_REQUESTS` | No | `10` | Max messages per minute per user |

---

## Security

Babu Bhai is **secure by default** — no opt-in required.

| Layer | Protection |
|---|---|
| **Authentication** | User whitelist required (no open access mode) |
| **Input validation** | Message length limits, content checks |
| **Memory sanitization** | Prompt injection prevention in stored memories |
| **Directory isolation** | Claude Code restricted to approved directory |
| **Error handling** | Internal errors never leak to Telegram users |
| **Rate limiting** | 10 req/min per user + 5 max global concurrent |
| **Session validation** | Session IDs format-checked before CLI passthrough |
| **Audit logging** | All actions logged to SQLite |
| **System prompt cap** | 50KB max to prevent DoS via memory growth |

See [SECURITY.md](SECURITY.md) for full security policy and vulnerability reporting.

---

## Deploy to Server (EC2/VPS)

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install Claude Code
npm install -g @anthropic-ai/claude-code
claude login

# Clone and setup
git clone https://github.com/wiliyam/babu-bhai.git
cd babu-bhai
bun install
bun setup    # Interactive wizard

# Create systemd service
sudo tee /etc/systemd/system/babu-bhai.service << 'EOF'
[Unit]
Description=Babu Bhai AI Agent
After=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/babu-bhai
ExecStart=/home/$USER/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/$USER/babu-bhai/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable babu-bhai
sudo systemctl start babu-bhai
sudo journalctl -u babu-bhai -f
```

---

## Architecture

```
Telegram Message
  → grammY Bot
    → Auth Middleware (user whitelist)
    → Rate Limit Middleware (token bucket)
    → Security Validator (input length + sanitization)
    → Message Handler
      → Identity Loader (SOUL.md + IDENTITY.md)
      → Memory Injection (per-user MEMORY.md + daily notes)
      → Caveman Prompt (token reduction)
      → Claude SDK (subprocess stream-json)
    → Response → Telegram
```

```
src/
  index.ts              # Entry point + setup wizard trigger
  setup/wizard.ts       # Interactive first-run setup
  config/               # Zod-validated settings
  bot/
    core.ts             # grammY bot + middleware chain
    handlers/           # Commands + agentic message handler
    middleware/          # Auth, rate limiting
  claude/
    sdk.ts              # Claude CLI subprocess (stream-json)
    session.ts          # Auto-resume persistence
    facade.ts           # High-level integration
  identity/
    loader.ts           # SOUL.md personality bootstrap
  memory/
    store.ts            # Per-user MEMORY.md + SQLite search
  storage/
    database.ts         # Bun SQLite + migrations
    models.ts           # TypeScript interfaces
    repositories.ts     # Data access (parameterized queries)
  events/
    bus.ts              # Async pub/sub
  notifications/
    service.ts          # Rate-limited Telegram delivery
  security/
    auth.ts             # User whitelist (no open access)
    validator.ts        # Input sanitization, session ID validation
```

**Stack:** Bun, TypeScript (strict), grammY, Zod, Bun SQLite, pino, croner

---

## Roadmap

- [x] Core bot with Claude Code integration
- [x] Session persistence and auto-resume
- [x] Bot identity (SOUL.md + IDENTITY.md)
- [x] Persistent memory (per-user, sanitized)
- [x] Caveman mode (token reduction)
- [x] Interactive setup wizard
- [x] Security hardening (5-layer defense)
- [ ] Scheduled tasks (cron) with session isolation
- [ ] Skill/plugin system (community extensions)
- [ ] Webhook support (GitHub, generic)
- [ ] Voice message transcription
- [ ] Image/file upload handling
- [ ] Multi-project support
- [ ] Web dashboard
- [ ] Multi-channel (Slack, Discord)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Coding standards
- Pull request process
- Architecture overview

```bash
# Quick start for contributors
git clone https://github.com/YOUR_USERNAME/babu-bhai.git
cd babu-bhai
bun install
bun setup
bun dev       # Auto-reload on changes
bun typecheck # Must pass
bun lint      # Must pass
```

**Commit format:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

---

## Community

- [Issues](https://github.com/wiliyam/babu-bhai/issues) — Bug reports and feature requests
- [Discussions](https://github.com/wiliyam/babu-bhai/discussions) — Questions and ideas
- [Security](SECURITY.md) — Vulnerability reporting

---

## License

[MIT](LICENSE) — open source forever.

---

Built with Bun, TypeScript, and Claude.
