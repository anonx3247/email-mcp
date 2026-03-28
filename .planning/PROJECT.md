# email-mcp Multi-Account

## What This Is

An extension to the existing email-mcp MCP server that adds support for 1–3 email accounts in a single server instance. Each account has a user-defined label (e.g. "personal", "pro", "consultancy") and all 8 existing tools gain an optional `account` parameter to target a specific account by label or number, defaulting to the first account when omitted.

## Core Value

Claude can read, search, and send email across multiple accounts without switching MCP instances — just specify the account label.

## Requirements

### Validated

- [x] User can configure 1–3 accounts via manifest user_config (indexed fields: account_1_*, account_2_*, account_3_*) — Validated in Phase 01 & 02
- [x] Each account has a required label field (free text, e.g. "personal", "pro", "consultancy") — Validated in Phase 01
- [x] All 8 tools accept an optional `account` parameter (label string or account number 1–3) — Validated in Phase 02
- [x] When `account` param is omitted, tools default to account 1 — Validated in Phase 02
- [x] Account 2 and 3 config fields are optional — server starts with just account 1 — Validated in Phase 01
- [x] Config fields for accounts 2 and 3 mirror account 1 fields (email, password, imap_host, smtp_host, security modes, ports, username, ssl_verify) — Validated in Phase 01
- [x] Manifest user_config and mcp_config.env updated to support indexed env vars — Validated in Phase 02

### Active

(All requirements validated — see above)

### Out of Scope

- More than 3 accounts — complexity grows nonlinearly, cover the common case
- Account management tools (add/remove at runtime) — config-time only
- Per-account SENT_FOLDER override — not requested, add later if needed

## Context

- Existing codebase: `email-mcp/` in the same parent Dev directory
- 3 source files: `src/index.ts` (MCP server + tool handlers), `src/imap.ts` (IMAP ops), `src/smtp.ts` (SMTP ops)
- Config is entirely env-var based; manifest.json maps user_config fields to env vars for Claude Desktop
- All IMAP/SMTP functions currently read config from env vars directly via `getImapConfig()` / `getSmtpConfig()`
- 8 tools to update: list_mailboxes, list_emails, fetch_email, search_emails, send_email, move_email, mark_email, delete_email
- TypeScript strict mode, ESM, no `any` types

## Constraints

- **Tech stack**: TypeScript/Node.js, existing libs only (imapflow, nodemailer, zod, @modelcontextprotocol/sdk)
- **Config surface**: Must work with Claude Desktop's manifest user_config pattern (env var injection)
- **Backward compat**: Existing single-account env var layout must keep working for account 1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Indexed env vars (ACCOUNT_1_*, ACCOUNT_2_*) | Matches existing manifest pattern, no new config file format | Implemented — loadIndexedAccount() in accounts.ts |
| Optional account param defaulting to account 1 | Seamless for single-account users upgrading | Implemented — resolveAccount() returns accounts[0] when param is undefined |
| 3-account hard cap | Covers stated use case (personal/pro/consultancy), avoids dynamic config complexity | Implemented — manifest has 3-account slots, loadAccounts() loop covers [2,3] |

## Current Milestone: v1.0 Multi-Account Support

**Goal:** Add multi-account support to email-mcp so Claude can operate across 1–3 named email accounts in a single server instance.

**Target features:**
- Indexed env var config for up to 3 accounts (`ACCOUNT_1_*`, `ACCOUNT_2_*`, `ACCOUNT_3_*`)
- Per-account label field for human-friendly targeting ("personal", "pro", "consultancy")
- Optional `account` param on all 8 tools, defaulting to account 1
- Backward-compatible: single-account env var layout still works
- Updated manifest `user_config` and `mcp_config.env`

---
**Current state:** Phase 02 complete — all routing requirements implemented and verified. 45 tests passing, TypeScript clean.

*Last updated: 2026-03-28 after Phase 02 implementation complete*
