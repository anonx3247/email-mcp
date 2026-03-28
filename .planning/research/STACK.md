# Technology Stack — Multi-Account Research

**Project:** email-mcp multi-account support
**Researched:** 2026-03-28
**Scope:** Stack additions and changes needed for 1–3 account support

---

## Verdict: No New Dependencies Required

The existing four runtime dependencies handle all multi-account requirements. The work is pure
refactoring of how config is passed to existing library calls — not a library change.

---

## Current Stack (Verified Against Installed Modules)

| Library | package.json spec | Installed version | Notes |
|---------|-------------------|-------------------|-------|
| imapflow | ^1.0.172 | **1.2.8** | Version gap — spec is stale |
| nodemailer | ^6.10.1 | 6.10.1 | Current |
| zod | ^3.24.2 | (semver range) | Current |
| @modelcontextprotocol/sdk | ^1.12.1 | (semver range) | Current |

**Action required:** Update package.json spec for imapflow from `^1.0.172` to `^1.2.8` to
reflect what is actually installed. The 1.0.x → 1.2.x range crossed breaking change territory
in cleanup behavior (stream destroy, memory leak fixes); the installed version is what the
codebase has been tested with.

---

## How Each Dependency Handles Multi-Account

### imapflow 1.2.8 — IMAP client

**Multi-connection model:** Each `new ImapFlow(config)` is a fully independent connection
instance. There is no shared state between instances and no built-in pooling across accounts.
The current codebase already creates one instance per request and destroys it in a `finally`
block — this pattern scales directly to multiple accounts by parameterizing the config.

**What changes:** `getImapConfig()` currently reads from `process.env` directly. It must be
refactored to accept an `AccountConfig` object. The `createClient(config)` factory becomes
`createClient(accountConfig)`. All exported IMAP functions gain an `accountConfig` parameter.

**No version change needed.** `ImapFlowOptions` interface is unchanged in 1.2.x. The
`id` field in `ImapFlowOptions` can be set per-account for log disambiguation (optional
improvement).

**Confidence:** HIGH — verified against installed `lib/imap-flow.d.ts`.

### nodemailer 6.10.1 — SMTP client

**Multi-connection model:** `nodemailer.createTransport(options)` returns an independent
transporter. Multiple transporters with different configs coexist without interference.
Nodemailer has a built-in SMTP connection pool (`{ pool: true, maxConnections: N }`) for
high-volume single-account sending, but this feature is not relevant here — multi-account
means multiple separate transporter configs, not a pool.

**What changes:** `getSmtpConfig()` must be refactored identically to `getImapConfig()` —
accept an `AccountConfig` object rather than reading `process.env`. The `sendEmail` function
gains an `accountConfig` parameter. The `EMAIL_ADDRESS` read inside `sendEmail` for the `from`
field must also come from the account config.

**No version change needed.**

**Confidence:** HIGH — verified against installed source.

### zod 3.24.2 — Schema validation

**Multi-account impact:** Each tool schema gains one optional field:

```typescript
account: z.union([
  z.string(),                    // label, e.g. "personal"
  z.number().int().min(1).max(3) // index 1–3
]).optional()
```

No new zod capabilities are needed. The existing pattern of `.default()`, `.optional()`, and
`.describe()` covers the new parameter.

**Confidence:** HIGH.

### @modelcontextprotocol/sdk 1.12.1 — MCP protocol

No changes needed. Tool definitions remain the same structure. The new `account` parameter is
just another optional input field on each tool.

**Confidence:** HIGH.

---

## Recommended Stack for This Milestone

### Runtime Dependencies (unchanged)

| Technology | Version in package.json | Action |
|------------|-------------------------|--------|
| imapflow | ^1.0.172 → **^1.2.8** | Update spec to match installed |
| nodemailer | ^6.10.1 | No change |
| zod | ^3.24.2 | No change |
| @modelcontextprotocol/sdk | ^1.12.1 | No change |

### Dev Dependencies (unchanged)

All dev dependencies remain as-is. No new type definitions needed — imapflow ships its own
`lib/imap-flow.d.ts` and nodemailer has `@types/nodemailer`.

---

## Integration Points That Must Change

### 1. New `AccountConfig` type (new shared type, likely `src/config.ts`)

A typed config struct replaces direct `process.env` access in domain modules:

```typescript
interface AccountConfig {
  label: string;
  emailAddress: string;
  emailUsername?: string;   // defaults to emailAddress
  emailPassword: string;
  imapHost: string;
  imapPort?: number;
  imapSecurity: "ssl" | "starttls" | "none";
  smtpHost: string;
  smtpPort?: number;
  smtpSecurity: "ssl" | "starttls" | "none";
  sslVerify?: boolean;      // defaults true
  sentFolder?: string;      // defaults "Sent"
}
```

### 2. Config loading at startup (`src/index.ts` → new `src/config.ts`)

Parse `ACCOUNT_1_*`, `ACCOUNT_2_*`, `ACCOUNT_3_*` env vars into an array of `AccountConfig`.
Fall back to legacy bare env vars (`EMAIL_ADDRESS`, `IMAP_HOST`, etc.) for account 1 to
maintain backward compatibility.

Account resolution (label string or index 1–3) is a pure function over the loaded config
array — no library needed.

### 3. IMAP and SMTP domain functions gain `accountConfig` parameter

All exported functions in `src/imap.ts` and `src/smtp.ts` receive an `AccountConfig` instead
of reading `process.env`. `getImapConfig(account: AccountConfig)` and
`getSmtpConfig(account: AccountConfig)` become internal helpers that take the struct.

### 4. Tool handlers in `src/index.ts` resolve account then forward

```typescript
const config = resolveAccount(accounts, params.account ?? 1);
// config is AccountConfig, passed to domain function
```

---

## What NOT to Add

| Candidate | Decision | Reason |
|-----------|----------|--------|
| imapflow connection pool library | Skip | imapflow has no pool API; per-request connections are intentional, not a bottleneck for an MCP server at this scale |
| Generic config file parser (dotenv, cosmiconfig) | Skip | Env vars are the contract with Claude Desktop manifest; adding a config file format adds complexity without value |
| Account management library | Skip | 3-account hard cap makes dynamic config unnecessary; a Map<string, AccountConfig> is sufficient |
| `convict` / `env-schema` / config validation libs | Skip | Zod already does runtime validation; a dedicated config lib would duplicate it |
| `p-limit` or concurrency limiter | Skip | MCP tools are invoked sequentially by the LLM; no concurrent IMAP/SMTP calls to limit |

---

## Version Verification Notes

- imapflow 1.2.8 confirmed from `node_modules/imapflow/package-lock.json` entry and CHANGELOG
  dated 2026-01-28. No breaking changes to `ImapFlowOptions` in 1.0.x → 1.2.x range (only
  bug fixes and stream cleanup improvements).
- nodemailer 6.10.1 confirmed from lock file. No nodemailer 7.x exists as of research date.
- No other dependencies require version bumps for multi-account support.

---

## Sources

- `/Users/paul/Dev/email-mcp/node_modules/imapflow/lib/imap-flow.d.ts` — ImapFlowOptions type definition (HIGH confidence, installed source)
- `/Users/paul/Dev/email-mcp/node_modules/imapflow/CHANGELOG.md` — version history to 1.2.8 (HIGH confidence, installed source)
- `/Users/paul/Dev/email-mcp/node_modules/nodemailer/lib/smtp-pool/index.js` — pool feature exists but is single-account only (HIGH confidence, installed source)
- `/Users/paul/Dev/email-mcp/package-lock.json` — installed versions (HIGH confidence)
- `/Users/paul/Dev/email-mcp/src/imap.ts`, `src/smtp.ts` — current config/connection patterns (HIGH confidence)
