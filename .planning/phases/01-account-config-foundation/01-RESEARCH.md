# Phase 1: Account Config Foundation - Research

**Researched:** 2026-03-28
**Domain:** TypeScript module design — account config loading and resolution in Node.js MCP server
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Flat `AccountConfig` interface — all fields at top level, no nested sub-objects
- All fields required (no optional properties in the type)
- `password` is a required string — empty string represents no-auth setups
- `sentFolder` included so Phase 2 has no type changes to make
- Full type shape defined (see Architecture Patterns section)
- **Sentinel-based mode detection:** `ACCOUNT_1_EMAIL_ADDRESS` non-empty → indexed mode (all `ACCOUNT_1_*` used, legacy ignored); empty/missing → legacy mode (`EMAIL_ADDRESS`, `IMAP_HOST`, etc.)
- No field-by-field mixing — all-or-nothing per account
- Optional accounts 2 and 3 detected by `ACCOUNT_N_EMAIL_ADDRESS` non-empty; if non-empty, ALL fields validated
- Empty string check uses `.trim().length > 0` — NOT `!!` or `??` (Claude Desktop injects empty strings for unfilled optional fields)
- Error pattern: `console.error("ACCOUNT_1_IMAP_HOST is required")` + `process.exit(1)`
- `resolveAccount` throws `Error` with message listing all valid labels

### Claude's Discretion
- Default values for optional fields (port defaults, security defaults, sentFolder default, label default "account1/2/3")
- Internal structure of `loadAccounts()` (loop vs explicit per-account, Zod vs manual validation)
- Export surface: whether to export a pre-loaded singleton or just the functions

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONF-01 | User can configure up to 3 accounts via indexed env vars (`ACCOUNT_1_*`, `ACCOUNT_2_*`, `ACCOUNT_3_*`) | loadAccounts() reads up to 3 indexed account blocks; sentinel detection per account |
| CONF-02 | Each account has a label field — defaults to "account1/2/3" if omitted | `ACCOUNT_N_LABEL` env var with `"accountN"` fallback default |
| CONF-03 | Accounts 2 and 3 are optional — server starts with just account 1 | sentinel-based skipping: missing/empty `ACCOUNT_2_EMAIL_ADDRESS` → skip account 2 silently |
| CONF-04 | Existing single-account env vars continue working as account 1 (backward compat) | legacy mode fallback when `ACCOUNT_1_EMAIL_ADDRESS` is empty/missing |
</phase_requirements>

---

## Summary

Phase 1 delivers `src/accounts.ts` — a new module that is the single source of truth for all account configuration. It exports the `AccountConfig` interface, `SecurityMode` type, `loadAccounts()` function, and `resolveAccount()` function. No external libraries beyond what already exists in the project are needed; this is pure TypeScript module construction.

The core complexity is the two-mode env var loading strategy: legacy mode (backward compat with existing single-env-var setup) versus indexed mode (`ACCOUNT_1_*` vars), with the sentinel `ACCOUNT_1_EMAIL_ADDRESS` determining which mode applies for account 1. Accounts 2 and 3 follow indexed-only semantics with their own sentinels. The `.trim().length > 0` empty-string check is critical because Claude Desktop injects empty strings for unfilled optional fields in `manifest.json`.

The module must be library-agnostic — no `imapflow` or `nodemailer` imports — so it can be tested independently and so Phase 2 domain layer functions can import from it cleanly.

**Primary recommendation:** Build `src/accounts.ts` as a pure config module: export types + two functions. Have `index.ts` call `loadAccounts()` once at startup (replacing lines 7–34) and store the result for Phase 2 to consume.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (existing) | ^5.8.3 | Type definitions, strict mode | Already in project; strict config covers this |
| Node.js `process.env` | built-in | Env var reading | Zero-dependency, project-established pattern |

No new libraries needed. The user explicitly left "Zod vs manual validation" to Claude's discretion — see Architecture Patterns for recommendation.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod (existing) | ^3.24.2 | Runtime schema validation | Only if chosen for `loadAccounts()` internals |

**Installation:** No new packages needed. Zod is already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── accounts.ts    # NEW: AccountConfig type, loadAccounts(), resolveAccount()
├── index.ts       # MODIFIED: replace lines 7–34 with loadAccounts() call
├── imap.ts        # UNCHANGED in Phase 1 (Phase 2 concern)
└── smtp.ts        # UNCHANGED in Phase 1 (Phase 2 concern)
```

### Pattern 1: AccountConfig Interface and SecurityMode Type

**What:** Define the canonical flat interface and type in `accounts.ts`, re-export `SecurityMode` so `imap.ts` and `smtp.ts` can import it from one location in Phase 2.

**When to use:** Always — this is the locked shape from CONTEXT.md.

```typescript
// src/accounts.ts
export type SecurityMode = "ssl" | "starttls" | "none";

export interface AccountConfig {
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

`SecurityMode` currently exists as a private `type` in both `imap.ts` and `smtp.ts` (line 12 each). Phase 1 should define it once here; Phase 2 will update those files to import from `accounts.ts`.

### Pattern 2: Sentinel-Based Mode Detection in loadAccounts()

**What:** Check `ACCOUNT_1_EMAIL_ADDRESS.trim().length > 0` to choose indexed vs legacy mode for account 1. Accounts 2 and 3 are indexed-only with their own sentinels.

**When to use:** Always in `loadAccounts()`.

```typescript
// Source: CONTEXT.md locked decisions
function readStr(key: string): string {
  return process.env[key] ?? "";
}

function isPresent(value: string): boolean {
  return value.trim().length > 0;
}

export function loadAccounts(): AccountConfig[] {
  const useIndexed = isPresent(readStr("ACCOUNT_1_EMAIL_ADDRESS"));
  const account1 = useIndexed
    ? loadIndexedAccount(1)
    : loadLegacyAccount();

  const accounts: AccountConfig[] = [account1];

  for (const n of [2, 3]) {
    const sentinel = readStr(`ACCOUNT_${n}_EMAIL_ADDRESS`);
    if (isPresent(sentinel)) {
      accounts.push(loadIndexedAccount(n));
    }
  }

  return accounts;
}
```

### Pattern 3: Account Validation with Early Exit

**What:** For each required field, check with `.trim().length > 0` and call `console.error()` + `process.exit(1)` on failure. Matches the established pattern in the current `src/index.ts` (lines 15–33).

**When to use:** Inside `loadIndexedAccount(n)` and `loadLegacyAccount()`.

```typescript
// Source: CONVENTIONS.md — Configuration Validation (Early Exit) pattern
function requireStr(value: string, varName: string): string {
  if (!isPresent(value)) {
    console.error(`${varName} is required`);
    process.exit(1);
  }
  return value.trim();
}
```

The existing codebase uses `if (!emailAddress) { console.error("EMAIL_ADDRESS is required"); process.exit(1); }`. The new pattern uses `.trim().length > 0` for robustness against empty-string injection but produces identical console output format.

### Pattern 4: resolveAccount()

**What:** Accept `string | number | undefined`, return `AccountConfig` or throw `Error` with a message listing valid labels. Default to account 1 when `account` is `undefined`.

**When to use:** Called by Phase 2 tool handlers before any IMAP/SMTP operation.

```typescript
// Source: CONTEXT.md locked decisions + ROUT-03 case-insensitive exact match
export function resolveAccount(
  accounts: AccountConfig[],
  account: string | number | undefined
): AccountConfig {
  if (account === undefined) {
    return accounts[0]!;  // always has at least one entry post-loadAccounts
  }
  const needle =
    typeof account === "number"
      ? String(account)
      : account.toLowerCase();

  const match = accounts.find((a) =>
    typeof account === "number"
      ? a.label === `account${account}`
      : a.label.toLowerCase() === needle
  );

  if (!match) {
    const valid = accounts.map((a) => `"${a.label}"`).join(", ");
    throw new Error(`Unknown account "${account}". Valid accounts: ${valid}`);
  }

  return match;
}
```

Note: ROUT-03 (case-insensitive) and ROUT-04 (error listing labels) are Phase 2 requirements, but `resolveAccount` is a Phase 1 deliverable per the success criteria. The function signature accepts `accounts` as a parameter (not a module-level singleton) so it remains pure and testable.

### Pattern 5: Default Values

**What:** Apply sensible defaults for fields that are optional in the env but required in `AccountConfig`.

| Field | Default |
|-------|---------|
| `label` | `"account1"` / `"account2"` / `"account3"` |
| `username` | falls back to `emailAddress` (matches existing `EMAIL_USERNAME ?? EMAIL_ADDRESS` pattern) |
| `imapSecurity` | `"ssl"` |
| `smtpSecurity` | `"ssl"` |
| `imapPort` | `993` for ssl, `143` otherwise |
| `smtpPort` | `465` for ssl, `587` for starttls, `25` for none |
| `sslVerify` | `true` (existing: `process.env["SSL_VERIFY"] !== "false"`) |
| `sentFolder` | `"Sent"` (existing `SENT_FOLDER` default) |

### Pattern 6: index.ts Integration

**What:** Replace the current startup validation block (lines 7–34 of `src/index.ts`) with a single `loadAccounts()` call. Store result in a module-level `const`.

```typescript
// src/index.ts (after Phase 1)
import { loadAccounts } from "./accounts.js";
// ...
const accounts = loadAccounts();
// Startup logging — print all loaded accounts
for (const acct of accounts) {
  console.error(`  [${acct.label}] ${acct.emailAddress}`);
  console.error(`    IMAP: ${acct.imapHost}:${acct.imapPort} (${acct.imapSecurity})`);
  console.error(`    SMTP: ${acct.smtpHost}:${acct.smtpPort} (${acct.smtpSecurity})`);
}
```

Phase 1 replaces the validation block and startup log only. Tool handlers remain unchanged — Phase 2 wires `accounts` through.

### Anti-Patterns to Avoid

- **Using `!!envValue` or `?? ""` as a presence check:** Empty strings pass `!!` as falsy in JS but the concern is `.trim()` — a string of spaces would slip through. Use `.trim().length > 0` consistently.
- **Using `||` for defaults:** The project convention is `??`. A value of `"0"` for a port must not trigger a default; use `?? defaultPort`.
- **Importing imapflow or nodemailer in accounts.ts:** This module must remain library-agnostic. Domain config adapters (e.g., `imapConfigFromAccount`) belong in `imap.ts` / `smtp.ts` and are Phase 2 work.
- **Module-level singleton array:** Do not export `const accounts = loadAccounts()` at module level. Singletons prevent testability and make startup order implicit. Export the function; let `index.ts` own the singleton.
- **parseInt without radix:** Always `parseInt(str, 10)` — matches existing `imap.ts` line 21 and `smtp.ts` line 17.
- **Using `as SecurityMode` cast without a validity check:** The existing code uses `(process.env["IMAP_SECURITY"] as SecurityMode | undefined)`. For a new module, validate the value is one of the three literal strings before narrowing to avoid silent misconfig.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Port string → number | Custom int parser | `parseInt(str, 10)` | Already used in imap.ts/smtp.ts; handles edge cases |
| Zod schema for runtime validation | Manual field-by-field type narrowing | `z.object({...}).parse()` | Optional but available; if chosen it eliminates the cast-then-validate pattern for SecurityMode |

**Key insight:** This module is almost entirely string-manipulation and branching logic. The main "don't hand-roll" concern is the SecurityMode validation — use a literal array check (`["ssl", "starttls", "none"].includes(val)`) rather than hoping a cast is safe.

---

## Common Pitfalls

### Pitfall 1: Empty String from Claude Desktop
**What goes wrong:** `ACCOUNT_2_EMAIL_ADDRESS` is `""` (empty string) because the user left an optional field blank in Claude Desktop's manifest form. Code using `!!val` or `val ?? fallback` treats this as "configured" and proceeds to validate account 2, which then fails with missing fields.
**Why it happens:** Claude Desktop injects empty strings for all manifest env var fields, filled or not.
**How to avoid:** Always use `val.trim().length > 0` as the presence check. This is the locked decision — apply it everywhere in `loadAccounts()`.
**Warning signs:** Account 2 validation errors on a server that has no account 2 configured.

### Pitfall 2: SecurityMode Cast Without Validation
**What goes wrong:** `process.env["ACCOUNT_1_IMAP_SECURITY"] as SecurityMode` silently accepts `"tls"` or `"SSL"` (user typos), producing invalid config that fails at connection time with a cryptic error.
**Why it happens:** TypeScript casts are compile-time only; no runtime guard.
**How to avoid:** Validate before narrowing:
```typescript
const SECURITY_MODES = ["ssl", "starttls", "none"] as const;
function parseSecurityMode(val: string, varName: string): SecurityMode {
  const normalized = val.toLowerCase();
  if (!SECURITY_MODES.includes(normalized as SecurityMode)) {
    console.error(`${varName} must be one of: ssl, starttls, none`);
    process.exit(1);
  }
  return normalized as SecurityMode;
}
```
**Warning signs:** Connection errors that mention wrong port or TLS handshake failures when config looks correct.

### Pitfall 3: noUncheckedIndexedAccess Violations
**What goes wrong:** `accounts[0]` returns `AccountConfig | undefined` under `noUncheckedIndexedAccess: true` in tsconfig.json. Code that treats it as `AccountConfig` fails typecheck.
**Why it happens:** tsconfig has `"noUncheckedIndexedAccess": true` (confirmed in project tsconfig.json).
**How to avoid:** Use non-null assertion `accounts[0]!` only after guaranteeing the array has at least one element (which `loadAccounts()` ensures — it exits if account 1 fails), or use a helper that returns the first element with a runtime guard.
**Warning signs:** TypeScript error `Object is possibly 'undefined'` on array access.

### Pitfall 4: parseInt Returning NaN
**What goes wrong:** `parseInt("", 10)` returns `NaN`. If `ACCOUNT_1_IMAP_PORT` is set to an empty string, port becomes `NaN`, which serializes oddly and may cause silent connect failures.
**Why it happens:** Empty string env var + parseInt without a presence check.
**How to avoid:** Only parse port after confirming the value is present with `.trim().length > 0`, or check `isNaN(port)` after parsing.

### Pitfall 5: noUnusedLocals / noUnusedParameters Compilation Failures
**What goes wrong:** A helper function written for future use, or a parameter added for symmetry, causes `npm run typecheck` to fail.
**Why it happens:** tsconfig has `"noUnusedLocals": true` and `"noUnusedParameters": true`.
**How to avoid:** Only export/define what is actually used. Prefix truly unused params with `_` per the established ESLint rule.

### Pitfall 6: Import Path Without .js Extension
**What goes wrong:** `import { loadAccounts } from "./accounts"` fails at runtime in ESM.
**Why it happens:** Project uses `"type": "module"` (ESM); Node.js requires explicit `.js` extensions for local imports.
**How to avoid:** Always use `import { ... } from "./accounts.js"` — matches existing imports in `index.ts`.

---

## Code Examples

Verified patterns from existing codebase:

### Existing env var access style (from src/imap.ts:14-27)
```typescript
// Source: src/imap.ts lines 14-27
const host = process.env["IMAP_HOST"];
if (!host) throw new Error("IMAP_HOST is required");

const security: SecurityMode =
  (process.env["IMAP_SECURITY"] as SecurityMode | undefined) ?? "ssl";
const defaultPort = security === "ssl" ? 993 : 143;
const port = parseInt(process.env["IMAP_PORT"] ?? String(defaultPort), 10);
const sslVerify = process.env["SSL_VERIFY"] !== "false";

const username =
  process.env["EMAIL_USERNAME"] ?? process.env["EMAIL_ADDRESS"] ?? "";
const password = process.env["EMAIL_PASSWORD"] ?? "";
```

### Startup exit pattern (from src/index.ts:15-18)
```typescript
// Source: src/index.ts lines 15-18
if (!emailAddress) {
  console.error("EMAIL_ADDRESS is required");
  process.exit(1);
}
```

### Indexed env var naming convention
```typescript
// Pattern for Phase 1 — index N = 1, 2, or 3
process.env[`ACCOUNT_${n}_EMAIL_ADDRESS`]
process.env[`ACCOUNT_${n}_IMAP_HOST`]
process.env[`ACCOUNT_${n}_SMTP_HOST`]
process.env[`ACCOUNT_${n}_EMAIL_PASSWORD`]
process.env[`ACCOUNT_${n}_EMAIL_USERNAME`]
process.env[`ACCOUNT_${n}_IMAP_PORT`]
process.env[`ACCOUNT_${n}_IMAP_SECURITY`]
process.env[`ACCOUNT_${n}_SMTP_PORT`]
process.env[`ACCOUNT_${n}_SMTP_SECURITY`]
process.env[`ACCOUNT_${n}_SSL_VERIFY`]
process.env[`ACCOUNT_${n}_SENT_FOLDER`]
process.env[`ACCOUNT_${n}_LABEL`]
```

Legacy env var names (for fallback when `ACCOUNT_1_EMAIL_ADDRESS` is absent):
```
EMAIL_ADDRESS, EMAIL_USERNAME, EMAIL_PASSWORD,
IMAP_HOST, IMAP_PORT, IMAP_SECURITY,
SMTP_HOST, SMTP_PORT, SMTP_SECURITY,
SSL_VERIFY, SENT_FOLDER
```
(No `LABEL` in legacy mode — defaults to `"account1"`.)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Config scattered in imap.ts/smtp.ts/index.ts | Centralized in accounts.ts | Phase 1 (this work) | Single source of truth; Phase 2 domain adapters become simple |
| `SecurityMode` duplicated in imap.ts and smtp.ts | Defined once in accounts.ts, re-exported | Phase 1 (this work) | Eliminates duplicate type, reduces drift risk |
| Startup validation inline in index.ts | `loadAccounts()` call replaces lines 7–34 | Phase 1 (this work) | index.ts startup block becomes 1 line |

**No deprecated/outdated patterns in scope** — this is new module construction against an existing stable codebase.

---

## Open Questions

1. **Zod vs manual validation for `loadAccounts()`**
   - What we know: Zod is already a dependency; manual validation follows the existing `if (!host) throw` pattern
   - What's unclear: Whether Zod parse errors produce messages in the required `"FIELD_NAME is required"` format without custom formatting
   - Recommendation: Use manual validation to guarantee exact error message format matching the locked decision. Zod `z.object({}).parse()` wraps errors in `ZodError` which requires unwrapping to match the `console.error("FIELD is required")` format — extra complexity for no benefit in this case.

2. **Export surface: functions only vs functions + pre-called result**
   - What we know: index.ts must call `loadAccounts()` once at startup; Phase 2 tool handlers need the accounts array
   - What's unclear: Whether to export `const accounts = loadAccounts()` as a module singleton or keep it pure
   - Recommendation: Export only the functions. Module-level singletons call `process.exit(1)` on import, which is hostile to testing. Let `index.ts` own the singleton via `const accounts = loadAccounts()` at startup.

---

## Validation Architecture

### Test Framework

No test framework currently exists in this project. `package.json` has no test script, no test files exist, and no test config was found.

| Property | Value |
|----------|-------|
| Framework | None installed — Wave 0 must add one |
| Config file | None — see Wave 0 |
| Quick run command | `npx tsx --test src/*.test.ts` (after Wave 0 installs tsx or vitest) |
| Full suite command | same (small codebase, one file in Phase 1) |

**Recommended framework:** Node.js built-in test runner (`node:test`) with `tsx` for TypeScript, OR `vitest`. Vitest is preferred because:
- Zero config for TypeScript with ESM modules (matches `"type": "module"`)
- Compatible with existing tsconfig `moduleResolution: "bundler"`
- No separate config needed for a 3-file project

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | `ACCOUNT_1_*` + `ACCOUNT_2_*` → two distinct AccountConfig entries | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| CONF-02 | Label defaults to "account1/2/3" when `ACCOUNT_N_LABEL` absent | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| CONF-03 | Missing `ACCOUNT_2_EMAIL_ADDRESS` → no account 2 in result | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| CONF-04 | Legacy env vars (`EMAIL_ADDRESS` etc.) → account1 config | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| SC-1 | Legacy mode produces label "account1" | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| SC-2 | Indexed vars take precedence over legacy | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| SC-3 | Two accounts loaded from ACCOUNT_1_* and ACCOUNT_2_* | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| SC-4 | Missing required field → process.exit(1) with named field | unit (mock exit) | `npx vitest run src/accounts.test.ts` | Wave 0 |
| SC-5 | resolveAccount unknown → Error listing valid labels | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |
| SC-5b | resolveAccount undefined → returns account 1 | unit | `npx vitest run src/accounts.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run typecheck && npm run lint`
- **Per wave merge:** `npm run typecheck && npm run lint && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/accounts.test.ts` — unit tests covering all requirements above; requires mocking `process.env` and intercepting `process.exit`
- [ ] Install vitest: `npm install --save-dev vitest`
- [ ] Add test script to `package.json`: `"test": "vitest run"`
- [ ] `vitest.config.ts` — may not be needed (vitest works zero-config with `"type": "module"`)

**Note on testing `process.exit(1)`:** vitest supports `vi.spyOn(process, "exit")` to intercept without actually exiting. Tests must restore the spy after each test to avoid contamination.

---

## Sources

### Primary (HIGH confidence)

- Codebase direct read: `src/imap.ts`, `src/smtp.ts`, `src/index.ts` — SecurityMode definition, existing env var patterns, startup validation pattern
- Codebase direct read: `tsconfig.json` — `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, confirmed strict mode settings
- Codebase direct read: `.planning/codebase/CONVENTIONS.md` — error handling patterns, naming conventions, ESLint rules
- Codebase direct read: `.planning/codebase/ARCHITECTURE.md` — layer responsibilities, config layer design
- Codebase direct read: `.planning/phases/01-account-config-foundation/01-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)

- vitest ESM compatibility: well-established pattern; vitest is designed for Vite/ESM projects and handles `"type": "module"` natively

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing project dependencies confirmed
- Architecture: HIGH — all major decisions locked in CONTEXT.md; patterns directly from existing codebase
- Pitfalls: HIGH — pitfalls 1, 3, 5, 6 verified directly from project config; pitfalls 2 and 4 follow from standard TypeScript/Node.js behavior
- Validation architecture: MEDIUM — vitest recommended but not yet confirmed to install cleanly; framework choice left to planner if preferred

**Research date:** 2026-03-28
**Valid until:** 2026-06-28 (stable — no external APIs, all findings from local codebase)
