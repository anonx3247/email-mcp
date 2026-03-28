# Architecture Patterns: Multi-Account Support

**Domain:** Multi-account email MCP server extension
**Researched:** 2026-03-28
**Overall confidence:** HIGH — based on direct source analysis

---

## Recommended Architecture

### New component: `src/accounts.ts`

Introduce a single new file that owns all account config loading and resolution logic. Neither `imap.ts` nor `smtp.ts` should know about multiple accounts. `index.ts` should not contain account resolution logic. Everything account-related lives in `accounts.ts` and is consumed by `index.ts`.

```
src/
  accounts.ts   ← NEW: config loading, account resolution, AccountConfig type
  imap.ts       ← MODIFIED: accept AccountConfig param instead of reading process.env
  smtp.ts       ← MODIFIED: accept AccountConfig param instead of reading process.env
  index.ts      ← MODIFIED: load accounts at startup, add `account` param to all tools
  manifest.json ← MODIFIED: add account_2_* and account_3_* user_config fields
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `accounts.ts` | Load all account configs from env, validate, provide resolution by label or number | `index.ts` (startup + per-call resolution) |
| `imap.ts` | All IMAP operations; accept `AccountConfig` as a parameter | `accounts.ts` (type), `smtp.ts` (appendToMailbox) |
| `smtp.ts` | All SMTP operations; accept `AccountConfig` as a parameter | `accounts.ts` (type), `imap.ts` (appendToMailbox) |
| `index.ts` | MCP protocol, tool registration, Zod validation, account param routing | `accounts.ts`, `imap.ts`, `smtp.ts` |

The key invariant: `imap.ts` and `smtp.ts` never touch `process.env`. All env access is centralized in `accounts.ts`.

---

## Data Flow Changes

### Config Loading (startup)

```
index.ts main() calls loadAccounts()
  → accounts.ts reads ACCOUNT_1_*, ACCOUNT_2_*, ACCOUNT_3_* (and legacy vars)
  → validates: account 1 required, accounts 2/3 optional
  → returns AccountConfig[] (1–3 entries)
  → index.ts stores array, fails fast if account 1 is missing
```

### Per-Request Account Resolution

```
MCP client calls tool({ ..., account: "pro" | 2 | undefined })
  → index.ts Zod schema: account?: z.union([z.string(), z.number().int().min(1).max(3)])
  → index.ts calls resolveAccount(accounts, params.account)
  → accounts.ts looks up by label (case-insensitive) or by number (1-indexed)
  → returns AccountConfig for the matched account, or throws if not found
  → index.ts passes AccountConfig to domain function
```

### Domain Function Call (IMAP example)

```
Before: listMailboxes()
After:  listMailboxes(account: AccountConfig)

Before: createClient()              → getImapConfig() → process.env
After:  createClient(account)       → buildImapOptions(account) → account fields
```

---

## The `AccountConfig` Type

`accounts.ts` exports one central type used by all three files:

```typescript
export interface AccountConfig {
  // Identity
  label: string;          // e.g. "personal", "pro"
  accountNumber: number;  // 1, 2, or 3

  // Shared credentials
  emailAddress: string;
  emailUsername: string;  // defaults to emailAddress
  emailPassword: string;

  // IMAP
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityMode;

  // SMTP
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityMode;

  // TLS
  sslVerify: boolean;

  // Folders
  sentFolder: string;     // defaults to "Sent"
}
```

This type is the single handoff point between `accounts.ts` and the domain layer.

---

## Backward Compatibility Design

The env var fallback logic lives entirely inside `accounts.ts` and is invisible to callers. Account 1 is loaded by trying indexed vars first, then falling back to legacy vars:

```
ACCOUNT_1_EMAIL    → fallback: EMAIL_ADDRESS
ACCOUNT_1_PASSWORD → fallback: EMAIL_PASSWORD
ACCOUNT_1_IMAP_HOST→ fallback: IMAP_HOST
ACCOUNT_1_SMTP_HOST→ fallback: SMTP_HOST
ACCOUNT_1_IMAP_SECURITY → fallback: IMAP_SECURITY
ACCOUNT_1_SMTP_SECURITY → fallback: SMTP_SECURITY
ACCOUNT_1_IMAP_PORT     → fallback: IMAP_PORT
ACCOUNT_1_SMTP_PORT     → fallback: SMTP_PORT
ACCOUNT_1_USERNAME      → fallback: EMAIL_USERNAME
ACCOUNT_1_SSL_VERIFY    → fallback: SSL_VERIFY
ACCOUNT_1_LABEL         → fallback: "account1" (synthetic default)
```

A user with the old single-account config gets account 1 with label "account1". They never need to change anything. New users configure `ACCOUNT_1_*` fields directly.

---

## Account Resolution Logic

```typescript
// In accounts.ts
export function resolveAccount(
  accounts: AccountConfig[],
  selector: string | number | undefined
): AccountConfig {
  // No selector → account 1 (index 0)
  if (selector === undefined) return accounts[0];

  // Numeric selector: 1-indexed
  if (typeof selector === "number") {
    const account = accounts.find(a => a.accountNumber === selector);
    if (!account) throw new Error(`Account ${selector} is not configured`);
    return account;
  }

  // String selector: case-insensitive label match
  const lower = selector.toLowerCase();
  const account = accounts.find(a => a.label.toLowerCase() === lower);
  if (!account) {
    const available = accounts.map(a => `"${a.label}"`).join(", ");
    throw new Error(`Account "${selector}" not found. Available: ${available}`);
  }
  return account;
}
```

Error messages include available labels so Claude can self-correct when it passes a wrong account name.

---

## Connection Strategy: Per-Request (No Change)

The existing per-request connection pattern is correct and should not change. Each IMAP/SMTP operation creates a fresh client, operates, and cleans up in a finally block. This is appropriate because:

- MCP tool calls are infrequent and latency-tolerant relative to IMAP auth overhead
- No shared state between tools eliminates race conditions across accounts
- Connection pooling across accounts would require lifecycle management that adds complexity without measurable benefit for this use case
- ImapFlow already handles connection setup efficiently

The only change is that `createClient(account: AccountConfig)` and `buildImapOptions(account: AccountConfig)` take the config as a parameter rather than reading from `process.env`.

---

## Modified Function Signatures

### `imap.ts`

```typescript
// Before (private)
function getImapConfig(): ImapFlowOptions
function createClient(): ImapFlow

// After (private, account-aware)
function buildImapOptions(account: AccountConfig): ImapFlowOptions
function createClient(account: AccountConfig): ImapFlow

// All exported functions gain account parameter
export async function appendToMailbox(mailbox: string, raw: Buffer, flags: string[], account: AccountConfig): Promise<void>
export async function listMailboxes(account: AccountConfig): Promise<MailboxInfo[]>
export async function listEmails(mailbox: string, page: number, pageSize: number, account: AccountConfig): Promise<ListEmailsResult>
export async function fetchEmail(mailbox: string, uid: number, account: AccountConfig): Promise<FetchEmailResult>
export async function searchEmails(mailbox: string, criteria: SearchCriteria, limit: number, account: AccountConfig): Promise<EmailSummary[]>
export async function moveEmail(mailbox: string, uid: number, destination: string, account: AccountConfig): Promise<MoveEmailResult>
export async function deleteEmail(mailbox: string, uid: number, account: AccountConfig): Promise<{ uid: number; mailbox: string; deleted: boolean }>
export async function markEmail(mailbox: string, uid: number, read: boolean, account: AccountConfig): Promise<{ uid: number; mailbox: string; read: boolean }>
```

### `smtp.ts`

```typescript
// Before (private)
function getSmtpConfig(): SMTPTransport.Options

// After (private, account-aware)
function buildSmtpOptions(account: AccountConfig): SMTPTransport.Options

// sendEmail gains account parameter
export async function sendEmail(
  to: string | string[],
  subject: string,
  body: string,
  options: SendEmailOptions,
  account: AccountConfig
): Promise<SendEmailResult>
```

The `appendToMailbox` call inside `sendEmail` passes `account` through, so the sent-folder save uses the same account's IMAP config. This is the correct behavior — sent mail for account 2 saves to account 2's sent folder.

### `index.ts`

All tool handlers gain the account resolution step:

```typescript
// Startup: load accounts once
const accounts = loadAccounts(); // exits on failure

// Each tool registration gains account param in Zod schema:
account: z.union([z.string(), z.number().int().min(1).max(3)])
  .optional()
  .describe('Account label (e.g. "personal") or number (1–3). Defaults to account 1.')

// Each handler resolves before calling domain:
const account = resolveAccount(accounts, params.account);
const result = await listMailboxes(account);
```

---

## Startup Validation

The current startup validation in `index.ts` (lines 8–34) reads specific env vars eagerly. This block is replaced entirely by a call to `loadAccounts()` in `accounts.ts`, which performs all validation and returns `AccountConfig[]`.

`loadAccounts()` rules:
- Account 1 must exist (either via `ACCOUNT_1_EMAIL` or legacy `EMAIL_ADDRESS`) — exits with code 1 if missing
- Accounts 2 and 3 are included only if their label env var is set (`ACCOUNT_2_LABEL`, `ACCOUNT_3_LABEL`)
- An account with a label but missing required fields (email, password, imap_host, smtp_host) exits with code 1 and names which account failed

The startup log changes from printing one account to printing all configured accounts:

```
email-mcp starting
  Account 1 (personal): user@gmail.com | IMAP imap.gmail.com:993 ssl | SMTP smtp.gmail.com:465 ssl
  Account 2 (pro): user@work.com | IMAP imap.work.com:993 ssl | SMTP smtp.work.com:587 starttls
```

---

## Manifest Changes

The `manifest.json` `user_config` section gains two new groups of optional fields following the existing field schema. The `mcp_config.env` section gains the corresponding indexed env var mappings.

Account 1 fields are renamed from unprefixed (`email_address`) to indexed (`account_1_email`), with the legacy unprefixed names retained in `mcp_config.env` as the fallback channel. This means existing users who have already configured the legacy field names continue to work without reconfiguring.

For accounts 2 and 3, all fields are optional in `user_config`. The manifest will show them as optional so users who only need one account are not confused.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Spreading account resolution into imap.ts / smtp.ts
**What it looks like:** Passing `accountId` as a string/number to domain functions and having them call a resolver internally.
**Why bad:** Domain layer gains a dependency on accounts module. The domain layer's job is protocol operations, not config resolution. Testing becomes harder because domain functions need the full accounts array.
**Instead:** Resolve to `AccountConfig` in `index.ts` before calling domain functions. Domain functions only receive the resolved config.

### Anti-Pattern 2: Making `AccountConfig` a partial/optional bag
**What it looks like:** `Partial<AccountConfig>` or optional fields on the type that functions must re-check.
**Why bad:** Every domain function would need null guards. The strictness of the codebase (`noUncheckedIndexedAccess`, no `any`) depends on having fully-resolved types. Account validation at startup should guarantee all required fields are present.
**Instead:** `AccountConfig` is fully populated at load time. Domain functions can access `account.imapHost` without null checks.

### Anti-Pattern 3: Connection pooling keyed by account
**What it looks like:** A Map from accountId to persistent ImapFlow instance.
**Why bad:** Adds connection lifecycle management (idle timeout, reconnect, cleanup on shutdown). MCP tools run infrequently; connection overhead is negligible. The current per-request pattern is a proven simplicity win.
**Instead:** Keep per-request connections. Pass `AccountConfig` through to `buildImapOptions`.

### Anti-Pattern 4: Keeping `getImapConfig()` and `getSmtpConfig()` reading from `process.env` and adding account index param
**What it looks like:** `getImapConfig(accountNum: number)` still reads `process.env["ACCOUNT_${accountNum}_IMAP_HOST"]`.
**Why bad:** Config reading stays scattered across multiple files. Backward compat logic gets duplicated. Testing requires mocking `process.env` in multiple modules.
**Instead:** Centralize in `accounts.ts`. Replace `getImapConfig` and `getSmtpConfig` with `buildImapOptions(account)` and `buildSmtpOptions(account)` that operate on an already-loaded struct.

---

## Build Order

Dependencies run in this order — each step can only begin after the previous:

1. **Define `AccountConfig` type and `SecurityMode` in `accounts.ts`**
   - No dependencies on other modules
   - Also define `loadAccounts()` and `resolveAccount()` functions
   - Export `SecurityMode` from here so imap.ts and smtp.ts import it from one place (avoids duplication of the type alias)

2. **Modify `imap.ts`**
   - Import `AccountConfig` from `./accounts.js`
   - Replace `getImapConfig()` and `createClient()` with account-parameterized versions
   - Add `account: AccountConfig` as last parameter to all exported functions
   - Remove `SecurityMode` local type alias (import from accounts.ts)

3. **Modify `smtp.ts`**
   - Import `AccountConfig` from `./accounts.js`
   - Replace `getSmtpConfig()` with account-parameterized version
   - Replace `process.env["EMAIL_ADDRESS"]` read (line 63) with `account.emailAddress`
   - Replace `process.env["SENT_FOLDER"]` read (line 91) with `account.sentFolder`
   - Add `account: AccountConfig` as last parameter to `sendEmail()`
   - Pass `account` through to `appendToMailbox()`
   - Remove `SecurityMode` local type alias (import from accounts.ts)

4. **Modify `index.ts`**
   - Import `loadAccounts`, `resolveAccount`, `AccountConfig` from `./accounts.js`
   - Replace startup validation block (lines 8–34) with `loadAccounts()` call
   - Update startup log to print all accounts
   - Add `account` optional param to all 8 Zod schemas
   - Add `resolveAccount(accounts, params.account)` at top of each handler
   - Pass `account` to all domain function calls

5. **Modify `manifest.json`**
   - Add `account_2_*` and `account_3_*` user_config fields (all optional)
   - Add `account_1_label` field (required, with fallback note in description)
   - Add corresponding indexed env var mappings in `mcp_config.env`
   - Keep existing unprefixed field names in `user_config` for backward compat during migration period, or document that they remain as the fallback path

Steps 2 and 3 can be done in parallel. Step 4 depends on both. Step 5 is independent of all TypeScript steps.

---

## What Is New vs Modified

| File | Status | Changes |
|------|--------|---------|
| `src/accounts.ts` | **NEW** | `AccountConfig` type, `SecurityMode` type, `loadAccounts()`, `resolveAccount()` |
| `src/imap.ts` | **MODIFIED** | Replace env reads with `AccountConfig` param on all exported + internal functions |
| `src/smtp.ts` | **MODIFIED** | Replace env reads with `AccountConfig` param; pass account to `appendToMailbox` |
| `src/index.ts` | **MODIFIED** | Replace startup validation; add `account` Zod param to 8 tools; add resolution step |
| `manifest.json` | **MODIFIED** | Add account_1_label, account_2_*, account_3_* user_config and mcp_config.env entries |

No new npm dependencies required. All changes use existing types from `imapflow`, `nodemailer`, and `zod`.

---

## Scalability Considerations

This architecture deliberately supports exactly 1–3 accounts. The design is intentionally not a dynamic registry.

| Concern | Current (1 account) | After (1–3 accounts) |
|---------|--------------------|-----------------------|
| Startup validation | 4 env var checks, exit(1) | loadAccounts() validates all configured accounts |
| Per-request overhead | 0 resolution step | One array find (max 3 elements, negligible) |
| Connection count | 1 per request | 1 per request (unchanged, per-account) |
| Config complexity | Single flat env namespace | Indexed namespace + legacy fallback layer |
| Manifest complexity | 10 user_config fields | ~30 user_config fields (10 per account, accounts 2–3 optional) |

The 3-account hard cap avoids needing dynamic config management or a config file. The design cannot accidentally grow to N accounts.

---

## Sources

- Direct source analysis of `src/index.ts`, `src/imap.ts`, `src/smtp.ts`, `manifest.json` (2026-03-28)
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md` (codebase analysis 2026-03-27)
- `.planning/PROJECT.md` requirements (2026-03-28)

*Confidence: HIGH — all findings based on direct code inspection, no external sources required for this architectural question.*
