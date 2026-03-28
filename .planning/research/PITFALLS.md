# Domain Pitfalls

**Domain:** Multi-account support added to existing single-account MCP email server
**Researched:** 2026-03-28
**Confidence:** HIGH — derived from direct code analysis of the actual codebase

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or silent cross-account contamination.

---

### Pitfall 1: Config Functions Reading Global env Vars Instead of Account-Scoped Config

**What goes wrong:** `getImapConfig()` and `getSmtpConfig()` currently read directly from
`process.env` at call time. If you simply add a new call path that sets per-account env vars
before calling these functions, you create a race condition in concurrent tool calls — one
tool call may pick up another account's env vars.

**Why it happens:** The current design couples config resolution to global process state.
It feels easy to "just set `process.env.IMAP_HOST` before each call," but Node.js is
single-threaded with async concurrency: two simultaneous tool calls will interleave their
env mutations.

**Consequences:**
- Silent cross-account reads: Claude fetches emails from the wrong account with no error.
- Silent cross-account sends: email sent from the wrong identity.
- Data integrity failure that is extremely hard to reproduce (timing-dependent).

**Prevention:** Pass an explicit `AccountConfig` object into `getImapConfig()` / `getSmtpConfig()`
(or replace them with `buildImapConfig(account: AccountConfig)`). Config resolution must be
a pure function of its parameter, with zero global state reads after startup.

**Detection:** Add an assertion at the top of each config builder: if it reads from `process.env`
directly and an account param is present, throw. This makes the mistake loud immediately.

---

### Pitfall 2: Per-Account Connection State Colliding via Shared `createClient()`

**What goes wrong:** `createClient()` currently builds an `ImapFlow` from `getImapConfig()`.
If refactored to accept an account but the ImapFlow instance is stored in a module-level
variable shared across accounts, simultaneous calls for different accounts will share or
overwrite each other's open mailbox state.

**Why it happens:** ImapFlow is stateful — `mailboxOpen()` sets a "selected mailbox" on the
connection object. If account A's connection is reused for account B's request, `mailboxOpen()`
for the wrong mailbox could silently succeed, returning the wrong results.

**Consequences:**
- Wrong mailbox data returned to Claude with no error signal.
- IMAP "selected mailbox" state mismatch causing fetch errors or silent wrong-uid returns.

**Prevention:** Maintain a separate connection (or connection pool slot) per account label.
A `Map<string, ImapFlow>` keyed by account label is the minimum safe structure. Never share
a connection object across account labels.

**Detection:** Log the account label and connection object identity at the start of every IMAP
operation. If the same connection appears for two different account labels in concurrent calls,
alert.

---

### Pitfall 3: Backward-Compat Env Var Mapping Break

**What goes wrong:** The project requires that the current single-account env vars
(`EMAIL_ADDRESS`, `EMAIL_PASSWORD`, `IMAP_HOST`, `SMTP_HOST`, etc.) continue working
for account 1 after migration. The naive approach — requiring all accounts to use
`ACCOUNT_1_*` vars — breaks existing deployments silently: the server starts but uses
empty/undefined config because the old vars are not read.

**Why it happens:** The current `src/index.ts` validates `EMAIL_ADDRESS`, `IMAP_HOST`,
`SMTP_HOST`, `EMAIL_PASSWORD` at startup and exits with `process.exit(1)` if missing.
If startup validation is updated to check `ACCOUNT_1_EMAIL_ADDRESS` but existing users
still have `EMAIL_ADDRESS`, the server exits immediately — a hard break with no migration
path.

**Consequences:**
- All existing single-account deployments stop working on upgrade.
- Silent failure if validation is weakened: no startup error, but account 1 has undefined
  config, causing every tool call to fail at runtime.

**Prevention:** Account 1 config resolution must use fallback logic:
`ACCOUNT_1_EMAIL_ADDRESS ?? EMAIL_ADDRESS`. This must be explicit and tested. Startup
validation must check the resolved value, not the raw env var name.

**Detection:** Test: set only old-style env vars, start server, verify all 8 tools work.
Set only `ACCOUNT_1_*` vars, verify same. Set both, verify `ACCOUNT_1_*` wins.

---

### Pitfall 4: `sendEmail` Uses `process.env["EMAIL_ADDRESS"]` as `from` Directly

**What goes wrong:** In `src/smtp.ts` line 63, `sendEmail()` reads `process.env["EMAIL_ADDRESS"]`
directly (not through `getSmtpConfig()`) to set the `from` address. This is a second
undocumented global env var access that will not be caught when refactoring `getSmtpConfig()`
to be account-scoped.

**Why it happens:** The `from` address is a mail header concern separated from transport
config. It was added independently of the config function. Refactoring only `getSmtpConfig()`
leaves this raw `process.env` access in place, causing account 1's `EMAIL_ADDRESS` to be
used as `from` even when sending via account 2 or 3.

**Consequences:**
- Emails sent from account 2 arrive with account 1's address in the `From:` header.
- No error — the email sends successfully with the wrong identity.
- Hard to detect without examining sent message headers.

**Prevention:** The `from` address must be part of the `AccountConfig` type and passed
explicitly to `sendEmail()`. Audit every `process.env` read in all three source files before
marking the refactor complete.

**Detection:** Grep for `process.env` in all `src/` files after refactor. Any occurrence that
is not inside the config-resolution startup block is a bug.

---

### Pitfall 5: `appendToMailbox` in `smtp.ts` Uses IMAP Config from env, Not From Account Param

**What goes wrong:** After sending, `sendEmail()` calls `appendToMailbox()` (imported from
`imap.ts`) to save the sent copy. `appendToMailbox()` calls `createClient()` which calls
`getImapConfig()` which reads global env vars. When multi-account is added and `sendEmail()`
is given an account param, the SMTP send will use account 2's SMTP config, but the Sent
folder append will use account 1's IMAP config (from env fallback).

**Why it happens:** `smtp.ts` and `imap.ts` have a cross-module dependency where SMTP calls
into IMAP. This coupling is invisible during single-account operation. During multi-account
refactor, it is easy to update `sendEmail()` to accept an account but forget that
`appendToMailbox()` also needs the account's IMAP config passed explicitly.

**Consequences:**
- Sent email saved to account 1's Sent folder even when sending from account 2.
- No error — the append succeeds.
- User sees sent mail missing from account 2.

**Prevention:** `appendToMailbox()` must accept an explicit `ImapFlowOptions` or
`AccountConfig` parameter. It must never call `getImapConfig()` internally in the
multi-account version.

**Detection:** Integration test: send email from account 2, verify Sent folder of account 2
contains the message, and Sent folder of account 1 does not.

---

## Moderate Pitfalls

---

### Pitfall 6: Claude Desktop manifest `user_config` Field Count Explosion

**What goes wrong:** The current manifest has 10 `user_config` fields for one account. Three
accounts at full parity = 30 fields. Claude Desktop renders these as a form. A 30-field
form is unusable — users abandon setup.

**Why it happens:** The indexed env var pattern (`ACCOUNT_1_*`) maps naturally to indexed
`user_config` fields, but nobody considers the UX implication of tripling the form length.

**Consequences:**
- Poor onboarding experience for users configuring 2-3 accounts.
- Required fields for account 2/3 cannot be truly optional in the manifest if Claude Desktop
  treats all fields uniformly — may block form submission even when user only has 1 account.

**Prevention:** Mark all account 2 and account 3 fields as `"required": false` with empty
string defaults. Group fields by account using naming convention in `title`
(e.g. "Account 2: IMAP Host"). Consider omitting rarely-used optional fields (e.g.,
`email_username`, `ssl_verify`, port overrides) from account 2/3 to reduce form length.

**Detection:** Open the manifest in Claude Desktop with only account 1 fields filled.
Verify the server starts without errors for the empty account 2/3 fields.

---

### Pitfall 7: Empty String env Vars Passed by Claude Desktop for Unfilled Optional Fields

**What goes wrong:** Claude Desktop injects env vars for all `user_config` fields, including
optional ones the user left blank. An unfilled `account_2_imap_host` becomes
`ACCOUNT_2_IMAP_HOST=""` (empty string), not `undefined`. Code checking
`process.env["ACCOUNT_2_IMAP_HOST"]` will get `""` which is truthy in some contexts and
falsy in others.

**Why it happens:** The manifest `mcp_config.env` maps `"${user_config.account_2_imap_host}"`
unconditionally. Claude Desktop always substitutes the value, even empty string. The current
codebase already has this pattern: `IMAP_PORT` can be `""` and is handled via `parseInt` with
a fallback. But detection of "account 2 is not configured" requires checking the host field,
and `""` will pass `if (host)` — it won't.

**Consequences:**
- `getImapConfig()` for account 2 throws "IMAP_HOST is required" when host is `""` if the
  check is `if (!host)` (empty string is falsy — this one works).
- BUT: if code checks `host !== undefined` or uses `??` (nullish coalescing), empty string
  passes and an ImapFlow is constructed with `host: ""`, causing a cryptic DNS error.

**Prevention:** Account presence detection must check `host !== undefined && host !== ""`
(or use `.trim().length > 0`). The `??` operator is wrong for this check — use explicit empty
string guard. Document this explicitly in the config resolution code.

**Detection:** Set `ACCOUNT_2_IMAP_HOST=""` in env, call any tool with `account: 2`,
verify graceful error: "Account 2 is not configured."

---

### Pitfall 8: TypeScript Loose Typing During Config Refactor

**What goes wrong:** The existing `getImapConfig()` returns `ImapFlowOptions` directly and is
called without arguments. Refactoring to accept an account parameter while maintaining strict
TypeScript (no `any`) requires creating an `AccountConfig` intermediate type. If this type is
added as `Partial<>` or uses optional fields without explicit presence checks, TypeScript will
not catch cases where account 2's config is used before it's been validated as present.

**Why it happens:** Developers reach for `Partial<AccountConfig>` to represent "account 2 is
optional" but then pass it directly to functions expecting `AccountConfig`, relying on runtime
checks that TypeScript cannot verify.

**Consequences:**
- Type errors only appear at runtime.
- `ImapFlow` constructed with `undefined` for host — error is thrown deep inside imapflow,
  not at the call site.

**Prevention:** Use a discriminated union or explicit presence check before passing to config
builders:

```typescript
type ConfiguredAccount = { label: string; host: string; /* required fields */ };
type UnconfiguredAccount = { label: undefined };
type AccountSlot = ConfiguredAccount | UnconfiguredAccount;

function isConfigured(slot: AccountSlot): slot is ConfiguredAccount {
  return slot.label !== undefined;
}
```

Require `ConfiguredAccount` (not `AccountSlot`) in all IMAP/SMTP functions. The type system
then enforces the presence check at every call site.

**Detection:** Run `npm run typecheck` with strict mode. Any cast to `as` or non-null assertion
`!` in config resolution code is a warning sign.

---

### Pitfall 9: Account Resolution by Label is Case-Sensitive by Default

**What goes wrong:** The `account` parameter accepts a label string ("personal", "pro").
If account labels are stored as-configured and compared with `===`, then `account: "Personal"`
fails to match label `"personal"` silently — the tool falls back to account 1 with no error.

**Why it happens:** String equality is case-sensitive in JavaScript. Label comparison is easy
to write as `accounts.find(a => a.label === param)` without normalizing case.

**Consequences:**
- Claude uses account 1 when it should use account 2, with no error surfaced.
- User sees unexpected behavior that looks like a bug in Claude, not in the tool.

**Prevention:** Normalize labels to lowercase at both storage time and lookup time. Or compare
with `a.label.toLowerCase() === param.toLowerCase()`. Document the normalization in the
`account` parameter description.

**Detection:** Test: configure account with label `"Pro"`, call tool with `account: "pro"`,
verify correct account is used.

---

### Pitfall 10: UID Namespace Collision Between Accounts

**What goes wrong:** IMAP UIDs are per-mailbox, per-server integers. UID 42 in account 1's
INBOX and UID 42 in account 2's INBOX are completely different emails. If tool responses do
not include the account label, Claude may attempt to fetch or delete email UID 42 on the wrong
account because it only remembers the numeric UID from a previous `list_emails` call.

**Why it happens:** UID 42 looks the same whether it came from account 1 or account 2. Without
account context in the response, Claude has no way to know which account "owns" a given UID.

**Consequences:**
- `fetch_email` on the wrong account silently fetches a different email.
- `delete_email` on the wrong account permanently deletes the wrong email — no recovery.

**Prevention:** All tool responses that return UIDs must also include the account label in the
response payload. Example: `{ account: "personal", uid: 42, ... }`. This gives Claude the
context to specify the correct `account` param on follow-up calls.

**Detection:** List emails from two accounts that both have low UIDs (1-10). Ask Claude to
fetch UID 3 without specifying account. Verify it either asks which account or defaults to
account 1 explicitly.

---

## Minor Pitfalls

---

### Pitfall 11: Nodemailer Transporter Not Scoped to Account

**What goes wrong:** `sendEmail()` creates a nodemailer transporter with `getSmtpConfig()`
inline. With multi-account, a new transporter must be created per-account per-send (or pooled
per-account). If a transporter is inadvertently shared across accounts (e.g., stored in a
module-level variable), account 1's SMTP credentials will be used for all sends.

**Prevention:** Keep transporter creation inside `sendEmail()` scoped to the account config
parameter. Do not cache transporters at module level. Nodemailer transporters are lightweight
to create and the current pattern of `createTransport` + `transporter.close()` in finally is
correct — replicate this per-account.

---

### Pitfall 12: Startup Validation Logic Becomes Overly Complex

**What goes wrong:** The current startup validation in `src/index.ts` exits with helpful
messages if required vars are missing. With 3 accounts, the validation could grow into a
nested conditional mess that is hard to read and easy to get wrong, causing the server to
either fail to start (over-strict) or start with broken config (under-strict).

**Prevention:** Extract account config loading into a single `loadAccounts(): AccountConfig[]`
function at startup. Validate each configured account in a loop. Fail fast for account 1
(required). For accounts 2 and 3: either fully configured or fully absent — partial
configuration (e.g., only `ACCOUNT_2_IMAP_HOST` set but `ACCOUNT_2_EMAIL_ADDRESS` missing)
should be a startup error with a clear message naming which field is missing for which account.

---

### Pitfall 13: IMAP Connection Limits Multiplied by Account Count

**What goes wrong:** The existing codebase creates one IMAP connection per tool call (noted
in CONCERNS.md as a known issue). With 3 accounts, a burst of concurrent tool calls could
now create 3x the connections — potentially hitting per-user IMAP connection limits (typically
5-10 per account) faster on each account individually.

**Prevention:** This is a pre-existing concern, not new to multi-account. However, if
connection pooling is added as part of this milestone (which CONCERNS.md recommends), ensure
the pool is keyed per account — a shared pool would allow account 1 to exhaust connections
meant for account 2.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Config refactor (index.ts) | Backward-compat env var mapping break (Pitfall 3) | Explicit fallback: `ACCOUNT_1_X ?? X` with tests |
| Config refactor (imap.ts) | Global env reads not replaced (Pitfall 1) | Grep for `process.env` after refactor, zero tolerance |
| Config refactor (smtp.ts) | `from` address still reads global env (Pitfall 4) | Audit smtp.ts line 63 explicitly |
| SMTP + IMAP cross-module | `appendToMailbox` uses wrong account's IMAP (Pitfall 5) | Pass IMAP config explicitly to `appendToMailbox` |
| Manifest update | Empty string from unfilled optional fields (Pitfall 7) | Use `host.trim().length > 0` not `!!host` |
| TypeScript types | `Partial<AccountConfig>` passed without guard (Pitfall 8) | Discriminated union; no `any`, no `!` assertions |
| Tool response design | UID namespace collision (Pitfall 10) | Include `account` label in every UID-bearing response |
| Account resolution | Case-sensitive label matching (Pitfall 9) | Normalize to lowercase at storage and lookup |
| Connection management | Connection state shared across accounts (Pitfall 2) | `Map<accountLabel, ImapFlow>` — never share instances |

---

## Sources

- Direct code analysis: `src/index.ts`, `src/imap.ts`, `src/smtp.ts` (all lines)
- Direct analysis: `manifest.json` (user_config fields and mcp_config.env mapping)
- `.planning/codebase/CONCERNS.md` (pre-existing known issues, 2026-03-27)
- `.planning/PROJECT.md` (requirements and constraints, 2026-03-28)
- Confidence: HIGH — all pitfalls derived from direct inspection of the actual codebase,
  not from general patterns. No speculative pitfalls included.
