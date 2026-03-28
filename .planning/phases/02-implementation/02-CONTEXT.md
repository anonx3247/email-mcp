# Phase 2: Implementation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor `imap.ts` and `smtp.ts` to accept `AccountConfig` instead of reading `process.env` directly, add the optional `account` parameter to all 8 MCP tools, and update `manifest.json` and `mcp_config.env` for multi-account config. No new account config loading logic — that's fully complete in Phase 1. No integration tests — that's Phase 3.

</domain>

<decisions>
## Implementation Decisions

### `account` parameter schema (all 8 tools)
- Type: `z.string().optional()`
- Description: `'Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'`
- Number-as-string still works (resolveAccount handles "2" → account2 label match)
- No `z.union` with number — string-only schema, simpler and sufficient

### Tool response format (ROUT-05)
- Every tool response is wrapped with a top-level `account` field: `{ account: "pro", ...existingFields }`
- `list_mailboxes` changes from returning a flat array to `{ account: "pro", mailboxes: [...] }` — consistent with all other tools
- Account label comes from the resolved `AccountConfig.label`

### Manifest migration (MFST-01)
- **Replace** legacy `user_config` fields (`email_address`, `email_password`, `imap_host`, etc.) with `account_1_*` equivalents
- Add optional `account_2_*` and `account_3_*` blocks
- Include `account_2_label` and `account_3_label` fields in `user_config` (defaults to `""`, maps to `ACCOUNT_2_LABEL` / `ACCOUNT_3_LABEL`)
- Migration rationale: existing Claude Desktop users are migrated by the manifest update — the new `account_1_*` fields replace the old fields, so users don't reconfigure manually
- `mcp_config.env` section maps all new `user_config` fields to `ACCOUNT_N_*` env vars (MFST-02)

### Domain layer refactor (`imap.ts`, `smtp.ts`)
- `getImapConfig()` → `imapConfigFromAccount(account: AccountConfig): ImapFlowOptions`
- `getSmtpConfig()` → `smtpConfigFromAccount(account: AccountConfig): SMTPTransport.Options`
- `createClient()` → accepts `AccountConfig`, builds `ImapFlowOptions` from it
- **Pitfall 4**: `smtp.ts` line 63 reads `process.env["EMAIL_ADDRESS"]` directly for `from` — must become `account.emailAddress`
- **Pitfall 5**: `appendToMailbox` inside `sendEmail` must receive the same `AccountConfig` to use account's IMAP config (not env vars). `appendToMailbox` signature gains an `account: AccountConfig` parameter.
- `SecurityMode` is already exported from `accounts.ts` — `imap.ts` and `smtp.ts` import it from there (no duplicate definition)

### Tool handler routing (`index.ts`)
- Module-scoped `accounts` array (already in place from Phase 1) is used by all 8 handlers
- Each handler calls `resolveAccount(accounts, account)` to get the `AccountConfig`, then passes it to the domain function
- `resolveAccount` throws on unknown account — the catch block in each handler already converts thrown errors to `isError: true` responses

### Claude's Discretion
- Exact ordering and grouping of `account_2_*` / `account_3_*` fields in `user_config` (alphabetical vs mirroring account 1 order)
- Whether `sent_folder` is included in account_1/2/3 manifest fields (it's in `AccountConfig` but wasn't in original manifest)
- Internal helper extraction (e.g. a shared `wrapResponse(account, data)` helper vs inline spreading)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — ROUT-01 through ROUT-05, MFST-01, MFST-02 define all Phase 2 requirements
- `.planning/ROADMAP.md` §"Phase 2: Implementation" — success criteria are the acceptance tests

### Phase 1 decisions (already implemented)
- `.planning/phases/01-account-config-foundation/01-CONTEXT.md` — `AccountConfig` type shape, `resolveAccount` behavior, empty string check pattern, `accounts` placement in `index.ts`

### Codebase patterns
- `.planning/codebase/CONVENTIONS.md` — TypeScript conventions, error handling patterns
- `.planning/codebase/ARCHITECTURE.md` — Existing config layer (getImapConfig, getSmtpConfig) being replaced

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/accounts.ts` `resolveAccount(accounts, account)` — ready to call in each tool handler; throws with valid labels listed
- `src/accounts.ts` `AccountConfig` type — all domain functions need to accept this instead of reading env vars
- `src/accounts.ts` `SecurityMode` — already exported; import from here in imap.ts and smtp.ts (removes duplicate definitions)
- `src/index.ts` module-scoped `accounts` array — already populated at startup, accessible by all handlers

### Established Patterns
- Tool handler error handling: `catch (e) { const msg = e instanceof Error ? e.message : String(e); return { isError: true, content: [...] } }` — resolveAccount errors flow through this unchanged
- `process.env["VAR"]` bracket notation — follow same style if any env reads remain (manifest/mcp_config only)

### Integration Points
- `src/imap.ts` `getImapConfig()` / `createClient()` — replace with account-parameterized versions
- `src/imap.ts` `appendToMailbox(mailbox, raw, flags)` — gains `account: AccountConfig` parameter (called from smtp.ts)
- `src/smtp.ts` `getSmtpConfig()` — replace with `smtpConfigFromAccount(account)`
- `src/smtp.ts` `sendEmail(to, subject, body, options)` — gains `account: AccountConfig` parameter; passes it to `appendToMailbox`
- `src/smtp.ts` line 63 `process.env["EMAIL_ADDRESS"]` — becomes `account.emailAddress`
- All 8 tool handlers in `src/index.ts` — each gains `account?: string` in its zod schema and calls `resolveAccount` before the domain call
- `manifest.json` `user_config` — legacy fields replaced; account 1/2/3 blocks added
- `mcp_config.env` `env` block — all new `ACCOUNT_N_*` env vars added

</code_context>

<specifics>
## Specific Ideas

- No specific references — open to standard implementation approaches for the refactor

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-implementation*
*Context gathered: 2026-03-28*
