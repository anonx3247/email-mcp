# Phase 1: Account Config Foundation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build `src/accounts.ts` with the `AccountConfig` type, `loadAccounts()` loader, and `resolveAccount()` resolver. This module is the single source of truth for all account config — domain layer (imap.ts, smtp.ts) and the protocol layer (index.ts) both depend on it. Nothing in Phase 2 can begin until this module is correct and fully tested against its success criteria.

</domain>

<decisions>
## Implementation Decisions

### AccountConfig type shape
- Flat interface — all fields at top level, no nested sub-objects
- All fields are required (no optional properties)
- `password` is a required string — empty string represents no-auth setups (avoids downstream conditional branches)
- `sentFolder` included in the foundation type so Phase 2 has no type changes to make
- Full shape:
  ```typescript
  interface AccountConfig {
    label: string;
    emailAddress: string;
    username: string;
    password: string;
    imapHost: string;
    imapPort: number;
    imapSecurity: SecurityMode;
    smtpHost: string;
    smtpPort: number;
    smtpSecurity: SecurityMode;
    sslVerify: boolean;
    sentFolder: string;
  }
  ```

### Legacy env var detection (account 1)
- **All-or-nothing based on `ACCOUNT_1_EMAIL_ADDRESS` as sentinel**
- If `ACCOUNT_1_EMAIL_ADDRESS` is non-empty → indexed mode: use all `ACCOUNT_1_*` vars for account 1; legacy vars are completely ignored
- If `ACCOUNT_1_EMAIL_ADDRESS` is empty/missing → legacy mode: use `EMAIL_ADDRESS`, `IMAP_HOST`, `SMTP_HOST`, etc. for account 1
- No field-by-field mixing at runtime — migration is handled at manifest level in Phase 2 (MFST-01 will copy legacy vars to `ACCOUNT_1_*` and remove the legacy fields so users never need to reconfigure)

### Partial account validation (accounts 2 and 3)
- Accounts 2 and 3 are optional — but "attempted" is detected by `ACCOUNT_N_EMAIL_ADDRESS` being non-empty
- If `ACCOUNT_2_EMAIL_ADDRESS` is non-empty → account 2 was attempted → validate ALL required fields; exit with a clear error naming the missing field if any are absent
- If `ACCOUNT_2_EMAIL_ADDRESS` is empty/missing → account 2 is not configured → skip silently
- Same logic applies for account 3
- Empty string check uses `.trim().length > 0` (not `!!` or `??`) — Claude Desktop injects empty strings for unfilled optional fields

### Error messages on startup
- Consistent pattern with existing codebase: `console.error("ACCOUNT_1_IMAP_HOST is required")` + `process.exit(1)`
- `resolveAccount` throws `Error` with message listing all valid labels (matches existing throw-on-invalid pattern in imap.ts/smtp.ts)

### Claude's Discretion
- Default values for optional fields (port defaults, security defaults, sentFolder default, label default "account1/2/3")
- Internal structure of `loadAccounts()` (loop vs explicit per-account, Zod vs manual validation)
- Export surface: whether to export a pre-loaded singleton or just the functions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` — CONF-01 through CONF-04 define all account config requirements
- `.planning/ROADMAP.md` §"Phase 1: Account Config Foundation" — success criteria are the acceptance tests for this module

### Codebase patterns
- `.planning/codebase/CONVENTIONS.md` — TypeScript conventions, error handling patterns, naming conventions
- `.planning/codebase/ARCHITECTURE.md` — Existing config layer design (getImapConfig, getSmtpConfig) that accounts.ts replaces

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/imap.ts` `SecurityMode` type alias — `accounts.ts` should define this once and re-export so both imap.ts and smtp.ts import it from accounts.ts (eliminates the duplicate definition that currently exists in each file)
- Error handling pattern: `if (!host) throw new Error("IMAP_HOST is required")` — same pattern for account validation

### Established Patterns
- Config as plain object: `getImapConfig()` returns `ImapFlowOptions`, `getSmtpConfig()` returns `SMTPTransport.Options`. Phase 2 will adapt these functions to accept `AccountConfig` and build library options from it — `accounts.ts` should stay library-agnostic (no imapflow/nodemailer imports)
- Startup validation in `src/index.ts` (lines 7–34): currently checks env vars directly. Phase 1 replaces this with a `loadAccounts()` call — index.ts will call it once at startup, exit on error, then pass the accounts array through to Phase 2's tool handlers
- `process.env["VAR"]` access pattern with bracket notation (not dot notation) throughout — follow same style

### Integration Points
- `src/index.ts` startup block (lines 7–34) — will be replaced by `const accounts = loadAccounts()` call
- `src/imap.ts` `getImapConfig()` — Phase 2 will replace with `imapConfigFromAccount(account: AccountConfig): ImapFlowOptions`
- `src/smtp.ts` `getSmtpConfig()` — Phase 2 will replace with `smtpConfigFromAccount(account: AccountConfig): SMTPTransport.Options`
- `src/smtp.ts` line 63: `process.env["EMAIL_ADDRESS"]` used directly in `sendEmail()` — Phase 2 concern (Pitfall 4)

</code_context>

<specifics>
## Specific Ideas

- Migration path: When Phase 2 updates `manifest.json` (MFST-01), it should copy legacy env var values into `ACCOUNT_1_*` fields and remove the legacy field definitions. This means existing users upgrading to multi-account never have to reconfigure their main account in Claude Desktop — the manifest migration handles it automatically.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-account-config-foundation*
*Context gathered: 2026-03-28*
