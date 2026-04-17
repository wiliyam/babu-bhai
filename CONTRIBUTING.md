# Contributing to Babu Bhai

Thank you for your interest in contributing! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Architecture Overview](#architecture-overview)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to the maintainers.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Claude Code CLI](https://claude.ai/code) installed (`npm install -g @anthropic-ai/claude-code`)
- Git
- A Telegram account (for testing)

### Fork and Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/babu-bhai.git
cd babu-bhai
bun install
```

### Create a Test Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token

### Run Setup

```bash
bun setup
```

This interactive wizard creates your `.env` and identity files.

### Run in Dev Mode

```bash
bun dev
```

The bot auto-reloads on file changes.

---

## Development Setup

```bash
# Install dependencies
bun install

# Run in dev mode (auto-reload)
bun dev

# Type check
bun typecheck

# Lint
bun lint

# Format code
bun format

# Run tests
bun test
```

---

## How to Contribute

### Types of Contributions

- **Bug fixes** — Find a bug? Fix it and submit a PR.
- **Features** — Check the [roadmap](#roadmap) or propose your own.
- **Documentation** — Improve README, add examples, fix typos.
- **Tests** — Increase test coverage.
- **Translations** — Help make the bot multilingual.
- **Security** — Report vulnerabilities responsibly (see [SECURITY.md](SECURITY.md)).

### Roadmap (Open for Contributions)

- [ ] Scheduled tasks (cron) with session isolation
- [ ] Webhook support (GitHub, generic)
- [ ] Voice message transcription
- [ ] Image/file upload handling
- [ ] Multi-project support (switch between projects)
- [ ] Web dashboard
- [ ] Multi-channel (Slack, Discord)
- [ ] Skill/plugin system (install community extensions)
- [ ] Token usage analytics
- [ ] Conversation export (Markdown, JSON)

---

## Pull Request Process

### 1. Create a Branch

```bash
git checkout -b feat/my-feature
# or
git checkout -b fix/bug-description
```

Branch naming:
- `feat/` — New features
- `fix/` — Bug fixes
- `refactor/` — Code refactoring
- `docs/` — Documentation
- `test/` — Tests
- `chore/` — Maintenance

### 2. Make Your Changes

- Follow the [coding standards](#coding-standards)
- Add tests for new functionality
- Update docs if needed

### 3. Verify

```bash
bun typecheck   # Must pass with zero errors
bun lint        # Must pass
bun test        # Must pass
```

### 4. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add voice message support"
git commit -m "fix: prevent memory file from exceeding size limit"
git commit -m "docs: add deployment guide for Railway"
```

### 5. Push and Open PR

```bash
git push origin feat/my-feature
```

Then open a PR on GitHub. Include:
- **Summary** — What changed and why
- **Test plan** — How to verify your changes
- **Screenshots** — If UI/output changed

### PR Review

- Maintainers will review within a few days
- Address feedback in new commits (don't force-push)
- PRs need at least 1 approval to merge
- All checks must pass (typecheck, lint, tests)

---

## Coding Standards

### TypeScript

- **Strict mode** enabled (`strict: true` in tsconfig)
- **Type hints** required on all function signatures
- **No `any`** — use proper types or `unknown`
- **Immutable by default** — use `const`, `readonly`, `Readonly<T>`

### Style

- **Formatter:** Biome (runs on save)
- **Max file length:** 400 lines (extract if larger)
- **Max function length:** 50 lines
- **Naming:** camelCase for variables/functions, PascalCase for classes/types

### Error Handling

- **Never swallow errors** — always log or propagate
- **Never leak internals to users** — generic messages in Telegram, details in logs
- **Validate at boundaries** — user input, env vars, external API responses

### Security

- **Never hardcode secrets** — use env vars
- **Sanitize all user input** before storage or prompt injection
- **Scope data per user** — no shared state between users
- **Parameterize SQL** — never interpolate user data into queries

### File Organization

```
src/
  module/
    index.ts     # Re-exports (if needed)
    types.ts     # Types and interfaces
    service.ts   # Business logic
    utils.ts     # Module-specific helpers
```

---

## Architecture Overview

```
Telegram → grammY Bot → Middleware Chain → Handler → Claude SDK → Response
                ↓              ↓
           Auth Check    Rate Limiter
                ↓
          Security Validator
```

| Layer | Responsibility |
|---|---|
| `config/` | Zod-validated settings from env |
| `bot/` | grammY bot, middleware, handlers |
| `claude/` | SDK subprocess wrapper, sessions |
| `identity/` | SOUL.md personality loader |
| `memory/` | Per-user persistent memory |
| `storage/` | Bun SQLite, repositories |
| `security/` | Auth, validation, audit |
| `events/` | Async event bus |

### Key Principles

1. **Security first** — validate everything, scope per user, sanitize before store
2. **Immutable data** — pass new objects, don't mutate
3. **Fail fast** — validate at startup, not at runtime
4. **Small files** — each file has one job
5. **Zero Python** — pure TypeScript/Bun

---

## Reporting Issues

### Bug Reports

Use the [bug report template](https://github.com/wiliyam/babu-bhai/issues/new?labels=bug):

- **Expected behavior** — What should happen
- **Actual behavior** — What actually happens
- **Steps to reproduce** — Minimal reproduction
- **Environment** — OS, Bun version, Claude Code version

### Feature Requests

Use the [feature request template](https://github.com/wiliyam/babu-bhai/issues/new?labels=enhancement):

- **Problem** — What problem does this solve?
- **Proposed solution** — How should it work?
- **Alternatives** — What else did you consider?

### Security Vulnerabilities

**Do NOT open a public issue.** Email the maintainers directly or use GitHub's private vulnerability reporting.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for helping make Babu Bhai better!
