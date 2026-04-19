# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Instead:
1. Use [GitHub's private vulnerability reporting](https://github.com/wiliyam/soulcast/security/advisories/new)
2. Or email the maintainers directly

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Fix/patch:** ASAP based on severity

## Security Model

Soulcast implements 5-layer defense:

1. **Authentication** — Telegram user ID whitelist (required, no open access)
2. **Input validation** — Message length limits, content sanitization
3. **Memory sanitization** — Prompt injection prevention in stored memories
4. **Directory isolation** — Claude Code restricted to approved directory
5. **Audit logging** — All actions logged to SQLite

### Secure by Default

- `ALLOWED_USERS` is **required** — no open-to-all mode
- `APPROVED_DIRECTORY` must be explicitly set — no filesystem root default
- Error messages **never leak** internal paths, tokens, or stack traces
- Memory entries are **sanitized** before storage
- System prompt is **size-capped** to prevent DoS
- Rate limiting defaults to **10 requests/minute** per user
- Global concurrent request cap of **5 Claude processes**
- Session IDs are **format-validated** before passing to CLI
- SQLite queries are **parameterized** (no string interpolation)
- Bot token is **never logged** at any level
