# Phase 2: Implementation - Research

**Researched:** 2026-03-28
**Domain:** TypeScript refactor — parameterized domain functions, MCP tool routing, manifest migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**`account` parameter schema (all 8 tools)**
- Type: `z.string().optional()`
- Description: `'Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'`
- Number-as-string still works (resolveAccount handles "2" → account2 label match)
- No `z.union` with number — string-only schema, simpler and sufficient

**Tool response format (ROUT-05)**
- Every tool response is wrapped with a top-level `account` field: `{ account: "pro", ...existingFields }`
- `list_mailboxes` changes from returning a flat array to `{ account: "pro", mailboxes: [...] }` — consistent with all other tools
- Account label comes from the resolved `AccountConfig.label`

**Manifest migration (MFST-01)**
- **Replace** legacy `user_config` fields (`email_address`, `email_password`, `imap_host`, etc.) with `account_1_*` equivalents
- Add optional `account_2_*` and `account_3_*` blocks
- Include `account_2_label` and `account_3_label` fields in `user_config` (defaults to `""`, maps to `ACCOUNT_2_LABEL` / `ACCOUNT_3_LABEL`)
- Migration rationale: existing Claude Desktop users are migrated by the manifest update — the new `account_1_*` fields replace the old fields, so users don't reconfigure manually
- `mcp_config.env` section maps all new `user_config` fields to `ACCOUNT_N_*` env vars (MFST-02)

**Domain layer refactor (`imap.ts`, `smtp.ts`)**
- `getImapConfig()` → `imapConfigFromAccount(account: AccountConfig): ImapFlowOptions`
- `getSmtpConfig()` → `smtpConfigFromAccount(account: AccountConfig): SMTPTransport.Options`
- `createClient()` → accepts `AccountConfig`, builds `ImapFlowOptions` from it
- **Pitfall 4**: `smtp.ts` line 63 reads `process.env["EMAIL_ADDRESS"]` directly for `from` — must become `account.emailAddress`
- **Pitfall 5**: `appendToMailbox` inside `sendEmail` must receive the same `AccountConfig` to use account's IMAP config (not env vars). `appendToMailbox` signature gains an `account: AccountConfig` parameter.
- `SecurityMode` is already exported from `accounts.ts` — `imap.ts` and `smtp.ts` import it from there (no duplicate definition)

**Tool handler routing (`index.ts`)**
- Module-scoped `accounts` array (already in place from Phase 1) is used by all 8 handlers
- Each handler calls `resolveAccount(accounts, account)` to get the `AccountConfig`, then passes it to the domain function
- `resolveAccount` throws on unknown account — the catch block in each handler already converts thrown errors to `isError: true` responses

### Claude's Discretion

- Exact ordering and grouping of `account_2_*` / `account_3_*` fields in `user_config` (alphabetical vs mirroring account 1 order)
- Whether `sent_folder` is included in account_1/2/3 manifest fields (it's in `AccountConfig` but wasn't in original manifest)
- Internal helper extraction (e.g. a shared `wrapResponse(account, data)` helper vs inline spreading)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROUT-01 | All 8 tools accept an optional `account` parameter (label string or number 1–3) | Schema pattern documented below; number-as-string handled by resolveAccount |
| ROUT-02 | When `account` is omitted, tools default to account 1 | `resolveAccount(accounts, undefined)` returns `accounts[0]` — already verified in Phase 1 tests |
| ROUT-03 | Account resolution is case-insensitive exact match on label | `resolveAccount` does `.toLowerCase()` comparison — already implemented and tested |
| ROUT-04 | Unknown `account` value returns an error listing valid account labels | `resolveAccount` throws `Error` with valid label list; existing catch blocks surface this as `isError: true` |
| ROUT-05 | Tool responses include the account label so Claude can track which account owns a UID | Wrap pattern: `{ account: resolvedAccount.label, ...existingResult }` applied in all 8 handlers |
| MFST-01 | `manifest.json` `user_config` updated with optional account 2 and 3 fields | Full field mapping documented below; legacy fields replaced with `account_1_*` equivalents |
| MFST-02 | `mcp_config.env` updated to document indexed env var names | `env` block in `mcp_config` maps `user_config.*` to `ACCOUNT_N_*` env vars |
</phase_requirements>

---

## Summary

Phase 2 is a surgical refactor with no new external dependencies and no new data loading logic. All account loading and resolution infrastructure was built in Phase 1. The work divides cleanly into three areas: (1) parameterize `imap.ts` and `smtp.ts` domain functions to accept `AccountConfig` instead of reading `process.env`, (2) add the `account` parameter to all 8 MCP tool handlers in `index.ts` and route each call through `resolveAccount`, and (3) migrate `manifest.json` legacy fields to indexed `account_1_*` equivalents and add optional `account_2_*` / `account_3_*` blocks.

The entire refactor stays within the existing codebase — no npm installs needed. The key risk points are the two direct `process.env` reads inside the domain layer that must become account-field accesses: `smtp.ts` line 63 (`process.env["EMAIL_ADDRESS"]` → `account.emailAddress`) and the `appendToMailbox` call chain inside `sendEmail` which must propagate the same `AccountConfig` through to the IMAP append operation. The `SecurityMode` type duplication in `imap.ts` and `smtp.ts` is eliminated by importing from `accounts.ts` where it is already exported.

The manifest migration is a pure JSON edit: replace 10 legacy `user_config` keys with equivalent `account_1_*` keys, add optional `account_2_*` and `account_3_*` blocks, and update the `mcp_config.env` block to map all new keys to `ACCOUNT_N_*` environment variables.

**Primary recommendation:** Implement in three sequential tasks: (1) refactor domain layer (`imap.ts`, `smtp.ts`), (2) update all 8 tool handlers in `index.ts`, (3) update `manifest.json`. This order prevents circular changes and keeps each task independently verifiable via `npm run typecheck`.

---

## Standard Stack

### Core — already installed, no changes needed

| Library | Version | Purpose | Role in Phase 2 |
|---------|---------|---------|-----------------|
| imapflow | ^1.0.172 | IMAP client | Receives `ImapFlowOptions` built from `AccountConfig` |
| nodemailer | ^6.10.1 | SMTP client | Receives `SMTPTransport.Options` built from `AccountConfig` |
| zod | ^3.24.2 | Input validation | `z.string().optional()` added to each tool schema |
| @modelcontextprotocol/sdk | ^1.12.1 | MCP protocol | No changes |
| vitest | ^4.1.2 | Test runner | Already installed and configured |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure (unchanged)

```
src/
├── accounts.ts      # AccountConfig type, loadAccounts, resolveAccount (Phase 1 — complete)
├── imap.ts          # imapConfigFromAccount, createClient(account), all IMAP ops (Phase 2 target)
├── smtp.ts          # smtpConfigFromAccount, sendEmail(account, ...) (Phase 2 target)
└── index.ts         # MCP handlers — each calls resolveAccount then domain fn (Phase 2 target)
```

### Pattern 1: Domain Function Parameterization

**What:** Replace `process.env` reads inside `imap.ts` and `smtp.ts` with `AccountConfig` fields. The config-builder functions become pure transformers — they receive an `AccountConfig` and return the library-specific options object.

**When to use:** Everywhere a domain function currently calls `getImapConfig()` or `getSmtpConfig()`.

**Before (imap.ts):**
```typescript
// reads process.env["IMAP_HOST"] etc.
function getImapConfig(): ImapFlowOptions { ... }

function createClient(): ImapFlow {
  return new ImapFlow(getImapConfig());
}

export async function appendToMailbox(mailbox: string, raw: Buffer, flags: string[]): Promise<void> {
  const client = createClient();
  ...
}
```

**After (imap.ts):**
```typescript
import type { AccountConfig, SecurityMode } from "./accounts.js";
// Remove local `type SecurityMode = ...` — import from accounts.ts instead

function imapConfigFromAccount(account: AccountConfig): ImapFlowOptions {
  const config: ImapFlowOptions = {
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecurity === "ssl",
    logger: false,
    tls: { rejectUnauthorized: account.sslVerify },
  };
  if (account.imapSecurity === "starttls") {
    config.secure = false;
  }
  if (account.password || account.imapSecurity !== "none") {
    config.auth = { user: account.username, pass: account.password };
  }
  return config;
}

function createClient(account: AccountConfig): ImapFlow {
  return new ImapFlow(imapConfigFromAccount(account));
}

export async function appendToMailbox(
  account: AccountConfig,
  mailbox: string,
  raw: Buffer,
  flags: string[] = ["\\Seen"]
): Promise<void> {
  const client = createClient(account);
  ...
}

export async function listMailboxes(account: AccountConfig): Promise<MailboxInfo[]> {
  const client = createClient(account);
  ...
}
// All other exported IMAP functions gain `account: AccountConfig` as first parameter
```

**After (smtp.ts):**
```typescript
import type { AccountConfig } from "./accounts.js";
// Remove local `type SecurityMode = ...` — import from accounts.ts instead

function smtpConfigFromAccount(account: AccountConfig): SMTPTransport.Options {
  const config: SMTPTransport.Options = {
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecurity === "ssl",
    requireTLS: account.smtpSecurity === "starttls",
    tls: { rejectUnauthorized: account.sslVerify },
  };
  if (account.password || account.smtpSecurity !== "none") {
    config.auth = { user: account.username, pass: account.password };
  }
  return config;
}

export async function sendEmail(
  account: AccountConfig,
  to: string | string[],
  subject: string,
  body: string,
  options: SendEmailOptions = {}
): Promise<SendEmailResult> {
  const transporter = nodemailer.createTransport(smtpConfigFromAccount(account));
  const from = account.emailAddress; // was: process.env["EMAIL_ADDRESS"]
  ...
  // appendToMailbox call:
  await appendToMailbox(account, account.sentFolder, raw); // was: appendToMailbox(sentFolder, raw)
  ...
}
```

### Pattern 2: Tool Handler Routing

**What:** Each of the 8 MCP tool handlers gains an `account?: string` Zod field, calls `resolveAccount(accounts, account)`, then passes the resolved `AccountConfig` to the domain function. The existing `catch` block surfaces `resolveAccount` errors as `isError: true` with no additional code.

**When to use:** All 8 handlers — uniform pattern, no exceptions.

**Example (list_mailboxes — before and after):**
```typescript
// BEFORE
server.tool(
  "list_mailboxes",
  "List available mailboxes/folders",
  {},
  async () => {
    try {
      const mailboxes = await listMailboxes();
      return { content: [{ type: "text", text: JSON.stringify(mailboxes, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

// AFTER
server.tool(
  "list_mailboxes",
  "List available mailboxes/folders",
  {
    account: z.string().optional().describe('Account label (e.g. "personal", "pro"). Defaults to account 1 if omitted.'),
  },
  async ({ account }) => {
    try {
      const acct = resolveAccount(accounts, account);
      const mailboxes = await listMailboxes(acct);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ account: acct.label, mailboxes }, null, 2),
        }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);
```

**The `{ account: acct.label, ...existingResult }` spread pattern for other tools:**
```typescript
// list_emails, fetch_email, search_emails, move_email, mark_email, delete_email:
const result = await listEmails(acct, mailbox, page, pageSize);
return {
  content: [{
    type: "text",
    text: JSON.stringify({ account: acct.label, ...result }, null, 2),
  }],
};

// send_email:
const result = await sendEmail(acct, to, subject, body, { cc, bcc, replyTo, isHtml });
return {
  content: [{
    type: "text",
    text: JSON.stringify({ account: acct.label, ...result }, null, 2),
  }],
};
```

Note: `list_mailboxes` cannot use spread because its current return is a flat array — it must use `{ account: acct.label, mailboxes }` explicitly (as decided in CONTEXT.md).

### Pattern 3: Manifest Field Migration

**What:** Replace legacy `user_config` fields in `manifest.json` with `account_1_*` equivalents. The `mcp_config.env` block maps each `user_config` key to the corresponding `ACCOUNT_N_*` environment variable.

**Field mapping — account 1 (replaces all legacy fields):**

| Old key | New key | Maps to env var |
|---------|---------|-----------------|
| `email_address` | `account_1_email_address` | `ACCOUNT_1_EMAIL_ADDRESS` |
| `email_password` | `account_1_email_password` | `ACCOUNT_1_EMAIL_PASSWORD` |
| `imap_host` | `account_1_imap_host` | `ACCOUNT_1_IMAP_HOST` |
| `smtp_host` | `account_1_smtp_host` | `ACCOUNT_1_SMTP_HOST` |
| `imap_security` | `account_1_imap_security` | `ACCOUNT_1_IMAP_SECURITY` |
| `smtp_security` | `account_1_smtp_security` | `ACCOUNT_1_SMTP_SECURITY` |
| `imap_port` | `account_1_imap_port` | `ACCOUNT_1_IMAP_PORT` |
| `smtp_port` | `account_1_smtp_port` | `ACCOUNT_1_SMTP_PORT` |
| `email_username` | `account_1_email_username` | `ACCOUNT_1_EMAIL_USERNAME` |
| `ssl_verify` | `account_1_ssl_verify` | `ACCOUNT_1_SSL_VERIFY` |

**Account 2 and 3 fields (all optional, `required: false`):**
- Mirror the account 1 set with `account_2_` and `account_3_` prefixes
- Add `account_2_label` (maps to `ACCOUNT_2_LABEL`, default `""`) and `account_3_label`
- `account_2_email_address` and `account_3_email_address` are the sentinels — if empty, the account is skipped

**`mcp_config.env` block structure:**
```json
"env": {
  "ACCOUNT_1_EMAIL_ADDRESS": "${user_config.account_1_email_address}",
  "ACCOUNT_1_EMAIL_PASSWORD": "${user_config.account_1_email_password}",
  "ACCOUNT_1_IMAP_HOST": "${user_config.account_1_imap_host}",
  "ACCOUNT_1_SMTP_HOST": "${user_config.account_1_smtp_host}",
  "ACCOUNT_1_IMAP_SECURITY": "${user_config.account_1_imap_security}",
  "ACCOUNT_1_SMTP_SECURITY": "${user_config.account_1_smtp_security}",
  "ACCOUNT_1_IMAP_PORT": "${user_config.account_1_imap_port}",
  "ACCOUNT_1_SMTP_PORT": "${user_config.account_1_smtp_port}",
  "ACCOUNT_1_EMAIL_USERNAME": "${user_config.account_1_email_username}",
  "ACCOUNT_1_SSL_VERIFY": "${user_config.account_1_ssl_verify}",
  "ACCOUNT_2_LABEL": "${user_config.account_2_label}",
  "ACCOUNT_2_EMAIL_ADDRESS": "${user_config.account_2_email_address}",
  "ACCOUNT_2_EMAIL_PASSWORD": "${user_config.account_2_email_password}",
  "ACCOUNT_2_IMAP_HOST": "${user_config.account_2_imap_host}",
  "ACCOUNT_2_SMTP_HOST": "${user_config.account_2_smtp_host}",
  "ACCOUNT_2_IMAP_SECURITY": "${user_config.account_2_imap_security}",
  "ACCOUNT_2_SMTP_SECURITY": "${user_config.account_2_smtp_security}",
  "ACCOUNT_2_IMAP_PORT": "${user_config.account_2_imap_port}",
  "ACCOUNT_2_SMTP_PORT": "${user_config.account_2_smtp_port}",
  "ACCOUNT_2_EMAIL_USERNAME": "${user_config.account_2_email_username}",
  "ACCOUNT_2_SSL_VERIFY": "${user_config.account_2_ssl_verify}",
  "ACCOUNT_3_LABEL": "${user_config.account_3_label}",
  "ACCOUNT_3_EMAIL_ADDRESS": "${user_config.account_3_email_address}",
  "ACCOUNT_3_EMAIL_PASSWORD": "${user_config.account_3_email_password}",
  "ACCOUNT_3_IMAP_HOST": "${user_config.account_3_imap_host}",
  "ACCOUNT_3_SMTP_HOST": "${user_config.account_3_smtp_host}",
  "ACCOUNT_3_IMAP_SECURITY": "${user_config.account_3_imap_security}",
  "ACCOUNT_3_SMTP_SECURITY": "${user_config.account_3_smtp_security}",
  "ACCOUNT_3_IMAP_PORT": "${user_config.account_3_imap_port}",
  "ACCOUNT_3_SMTP_PORT": "${user_config.account_3_smtp_port}",
  "ACCOUNT_3_EMAIL_USERNAME": "${user_config.account_3_email_username}",
  "ACCOUNT_3_SSL_VERIFY": "${user_config.account_3_ssl_verify}"
}
```

### Anti-Patterns to Avoid

- **Keeping `type SecurityMode` local in `imap.ts` or `smtp.ts`:** Both files must import `SecurityMode` from `accounts.ts` — eliminating the duplicate definitions is a Phase 2 goal.
- **Passing the `account` string (not the resolved `AccountConfig`) into domain functions:** Always resolve first with `resolveAccount`, then pass the `AccountConfig`. Domain functions should never receive raw user input.
- **Using `??` or `!!` for env var presence in any new code:** The established pattern (Pitfall 7) is `.trim().length > 0`. No new env reads exist in Phase 2, but this applies if any edge case arises.
- **Silent fallback to account 1 on unknown account:** REQUIREMENTS.md explicitly lists this as out of scope — resolveAccount throws, which is correct.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Account resolution | Custom lookup logic | `resolveAccount(accounts, account)` from `accounts.ts` | Already implemented, tested, handles case-insensitivity, number matching, and error messages |
| Error-to-MCP-response conversion | New error wrapping | Existing `catch (e) { const msg = e instanceof Error ? e.message : String(e); return { isError: true, ... } }` pattern | Already present in all 8 handlers — resolveAccount errors flow through unchanged |
| ImapFlow config building | New config logic | `imapConfigFromAccount` (direct field mapping from `AccountConfig`) | `AccountConfig` already has all required fields in correct types |
| SMTP config building | New config logic | `smtpConfigFromAccount` (direct field mapping from `AccountConfig`) | Same — `AccountConfig` mirrors the old env var logic exactly |

**Key insight:** The entire Phase 2 domain layer refactor is mechanical field mapping. `AccountConfig` was designed in Phase 1 to have exactly the fields needed by `imap.ts` and `smtp.ts` — the field names map 1-to-1.

---

## Common Pitfalls

### Pitfall 1: `smtp.ts` line 63 — direct `process.env["EMAIL_ADDRESS"]` read
**What goes wrong:** `sendEmail` reads `process.env["EMAIL_ADDRESS"]` for the `from` field (line 63), completely bypassing the account system. Emails sent via account 2 would still show account 1's address in the From field.
**Why it happens:** This was the only direct env read that wasn't hidden inside `getSmtpConfig()`.
**How to avoid:** Change `const from = process.env["EMAIL_ADDRESS"]` to `const from = account.emailAddress`. Remove the `if (!from) throw` check — `AccountConfig.emailAddress` is guaranteed non-empty by `requireStr` in Phase 1.
**Warning signs:** TypeScript will not catch this — it's a runtime correctness issue. Search for `process.env` in `smtp.ts` after the refactor and verify zero matches.

### Pitfall 2: `appendToMailbox` not receiving `AccountConfig`
**What goes wrong:** `sendEmail` calls `appendToMailbox(sentFolder, raw)`. If `appendToMailbox` is not updated to accept `AccountConfig`, it will reconstruct the IMAP client using stale env var logic (or the old `createClient()` with no args).
**Why it happens:** `appendToMailbox` is an IMAP function called from `smtp.ts` — the cross-module call must propagate the account.
**How to avoid:** Update `appendToMailbox` signature to `appendToMailbox(account: AccountConfig, mailbox: string, raw: Buffer, flags?: string[])`. The call site in `sendEmail` becomes `appendToMailbox(account, account.sentFolder, raw)`.
**Warning signs:** `npm run typecheck` will catch the signature mismatch if you update `appendToMailbox` before updating `sendEmail`.

### Pitfall 3: Forgetting to remove the local `SecurityMode` type alias
**What goes wrong:** `imap.ts` and `smtp.ts` each define `type SecurityMode = "ssl" | "starttls" | "none"` locally. After importing from `accounts.ts`, if the local definition remains, TypeScript will accept it silently (duplicate type aliases are valid TS) but the duplication creates drift risk.
**Why it happens:** Easy to overlook when adding the import.
**How to avoid:** Search for `type SecurityMode` in `imap.ts` and `smtp.ts` after the refactor and confirm exactly zero local definitions remain.

### Pitfall 4: `list_mailboxes` response shape change
**What goes wrong:** Before Phase 2, `list_mailboxes` returns a flat `MailboxInfo[]` serialized as a JSON array. After Phase 2, it must return `{ account: "...", mailboxes: [...] }`. If the wrap is done as a spread (`{ account: label, ...mailboxes }`), TypeScript will error and the output will be wrong.
**Why it happens:** Spread over an array produces index keys (`0`, `1`, `2`...), not a `mailboxes` key.
**How to avoid:** Use explicit object literal: `JSON.stringify({ account: acct.label, mailboxes }, null, 2)` — not the spread pattern.

### Pitfall 5: Tool handler receives `account` but domain function signature not yet updated
**What goes wrong:** If you update `index.ts` handlers first before updating `imap.ts`/`smtp.ts` signatures, TypeScript will report errors on every domain call site.
**How to avoid:** Update domain layer (`imap.ts`, `smtp.ts`) first, then `index.ts`. Each file passes `npm run typecheck` before moving to the next.

### Pitfall 6: Manifest — `required: false` vs omitting `required`
**What goes wrong:** Account 2 and 3 fields must not block server startup when empty. Using `required: true` would force users to fill them in Claude Desktop.
**How to avoid:** Account 2 and 3 `user_config` fields use `required: false` (or omit `required` entirely, depending on manifest spec). Account 1 required fields (`account_1_email_address`, `account_1_imap_host`, `account_1_smtp_host`, `account_1_email_password`) remain `required: true`. The existing `CONF-03` requirement (accounts 2 and 3 optional) is enforced by `loadAccounts()` at runtime via the sentinel check.

---

## Code Examples

### Complete `imapConfigFromAccount` function
```typescript
// imap.ts — replaces getImapConfig()
import type { AccountConfig } from "./accounts.js";
import type { ImapFlowOptions } from "imapflow";

function imapConfigFromAccount(account: AccountConfig): ImapFlowOptions {
  const config: ImapFlowOptions = {
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecurity === "ssl",
    logger: false,
    tls: {
      rejectUnauthorized: account.sslVerify,
    },
  };

  if (account.imapSecurity === "starttls") {
    config.secure = false;
  }

  if (account.password || account.imapSecurity !== "none") {
    config.auth = { user: account.username, pass: account.password };
  }

  return config;
}
```

### Complete `smtpConfigFromAccount` function
```typescript
// smtp.ts — replaces getSmtpConfig()
import type { AccountConfig } from "./accounts.js";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

function smtpConfigFromAccount(account: AccountConfig): SMTPTransport.Options {
  const config: SMTPTransport.Options = {
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecurity === "ssl",
    requireTLS: account.smtpSecurity === "starttls",
    tls: {
      rejectUnauthorized: account.sslVerify,
    },
  };

  if (account.password || account.smtpSecurity !== "none") {
    config.auth = { user: account.username, pass: account.password };
  }

  return config;
}
```

### `resolveAccount` import and use in `index.ts`
```typescript
import { loadAccounts, resolveAccount } from "./accounts.js";

const accounts = loadAccounts(); // already present from Phase 1

// In each handler:
async ({ account, mailbox, uid }) => {
  try {
    const acct = resolveAccount(accounts, account);
    const result = await fetchEmail(acct, mailbox, uid);
    return {
      content: [{ type: "text", text: JSON.stringify({ account: acct.label, ...result }, null, 2) }],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: "text", text: msg }] };
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getImapConfig()` reads `process.env` at call time | `imapConfigFromAccount(account)` receives config as parameter | Phase 2 | Domain functions become pure/testable; env coupling eliminated |
| `getSmtpConfig()` reads `process.env` at call time | `smtpConfigFromAccount(account)` receives config as parameter | Phase 2 | Same |
| `SecurityMode` defined in both `imap.ts` and `smtp.ts` | Single definition in `accounts.ts`, imported by both | Phase 2 | Eliminates drift risk |
| Tool responses are raw domain return values | All tool responses include top-level `account` field | Phase 2 | Claude can correlate UIDs across multi-account sessions |
| Manifest uses legacy single-account field names | Manifest uses `account_1_*` / `account_2_*` / `account_3_*` | Phase 2 | Multi-account config surface exposed via Claude Desktop UI |

**Deprecated/outdated after Phase 2:**
- `getImapConfig()` — removed entirely; replaced by `imapConfigFromAccount`
- `getSmtpConfig()` — removed entirely; replaced by `smtpConfigFromAccount`
- `createClient()` (no-args version) — replaced by `createClient(account: AccountConfig)`
- Legacy `user_config` manifest keys (`email_address`, `email_password`, `imap_host`, etc.) — replaced by `account_1_*` equivalents
- All remaining `process.env` reads in `imap.ts` and `smtp.ts` — zero must remain after Phase 2

---

## Open Questions

1. **`sent_folder` in manifest (Claude's Discretion)**
   - What we know: `AccountConfig.sentFolder` exists; the original manifest did not expose `SENT_FOLDER` as a `user_config` field
   - What's unclear: Whether to add `account_1_sent_folder` / `account_2_sent_folder` / `account_3_sent_folder` to the manifest
   - Recommendation: Include it — `AccountConfig` has the field, the env var is `ACCOUNT_N_SENT_FOLDER`, and per-account Sent folder configuration is a natural user need. Omitting it would require a follow-up manifest change if v2 requirements activate EXT-02.

2. **`account_2_*` / `account_3_*` field ordering in `user_config` (Claude's Discretion)**
   - What we know: JSON object key order is not semantically significant but affects readability in UIs
   - Recommendation: Mirror account 1 field order exactly for account 2 and 3 blocks. Group per account (all account_1 fields, then all account_2 fields, then all account_3 fields). Place label first in each group.

3. **`wrapResponse` helper extraction (Claude's Discretion)**
   - What we know: 7 of 8 handlers use the spread pattern; 1 (`list_mailboxes`) uses explicit object
   - Recommendation: Inline spreading is fine for this scale. A helper adds indirection without meaningful benefit at 8 call sites. Keep it inline.

---

## Validation Architecture

> `nyquist_validation` is `true` in `.planning/config.json` — this section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | none — vitest zero-config, `"test": "vitest run"` in package.json |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROUT-01 | All 8 tools accept optional `account` param | unit | `npm test -- src/index.test.ts` | ❌ Wave 0 |
| ROUT-02 | Omitted `account` defaults to account 1 | unit | `npm test -- src/index.test.ts` | ❌ Wave 0 |
| ROUT-03 | Case-insensitive label matching | unit | `npm test -- src/accounts.test.ts` | ✅ (resolveAccount tests cover this) |
| ROUT-04 | Unknown account returns error with valid labels | unit | `npm test -- src/index.test.ts` | ❌ Wave 0 |
| ROUT-05 | Tool responses include `account` field | unit | `npm test -- src/index.test.ts` | ❌ Wave 0 |
| MFST-01 | manifest.json has account_1/2/3 fields | manual | inspect file | N/A — file edit, not code |
| MFST-02 | mcp_config.env maps all ACCOUNT_N_* vars | manual | inspect file | N/A — file edit, not code |

Note: Domain function tests (verifying `imapConfigFromAccount` and `smtpConfigFromAccount` produce correct `ImapFlowOptions` / `SMTPTransport.Options`) are unit-testable without network access and should be included in Wave 0.

### Sampling Rate

- **Per task commit:** `npm run typecheck && npm test`
- **Per wave merge:** `npm run typecheck && npm run lint && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/index.test.ts` — covers ROUT-01, ROUT-02, ROUT-04, ROUT-05 (mock resolveAccount and domain functions, verify routing and response shape)
- [ ] `src/imap.test.ts` — covers `imapConfigFromAccount` correctness (ssl/starttls/none modes, port handling, auth presence)
- [ ] `src/smtp.test.ts` — covers `smtpConfigFromAccount` correctness and `from` field sourced from `account.emailAddress`

Existing: `src/accounts.test.ts` ✅ — covers ROUT-03 via `resolveAccount` case-insensitivity tests.

---

## Sources

### Primary (HIGH confidence)

- Direct source code inspection: `src/imap.ts`, `src/smtp.ts`, `src/index.ts`, `src/accounts.ts` — all changes mapped against actual current code
- `.planning/phases/02-implementation/02-CONTEXT.md` — user decisions are definitive constraints, not suggestions
- `.planning/phases/01-account-config-foundation/01-CONTEXT.md` — Phase 1 decisions define the `AccountConfig` contract Phase 2 consumes
- `.planning/codebase/CONVENTIONS.md` — TypeScript and error handling patterns verified against source
- `package.json` — confirmed vitest 4.1.2 is installed; `"test": "vitest run"` script exists
- `src/accounts.test.ts` — confirmed test infrastructure, `vi.stubEnv` pattern, vitest import style

### Secondary (MEDIUM confidence)

- `.planning/codebase/ARCHITECTURE.md` and `TESTING.md` — codebase analysis docs, may lag current source by minor Phase 1 changes

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json; no new installs needed
- Architecture patterns: HIGH — derived directly from reading current source files; changes are mechanical
- Pitfalls: HIGH — Pitfalls 1 and 2 are explicitly documented in CONTEXT.md and STATE.md; confirmed by reading the exact code lines affected
- Manifest migration: HIGH — current manifest.json read and all field mappings enumerated
- Validation architecture: HIGH — vitest presence and `accounts.test.ts` patterns confirmed from source

**Research date:** 2026-03-28
**Valid until:** This research is codebase-specific; valid until Phase 2 is complete or codebase changes. Not time-bounded by external library changes (no new libraries).
