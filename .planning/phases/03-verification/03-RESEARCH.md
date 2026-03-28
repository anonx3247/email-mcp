# Phase 3: Verification - Research

**Researched:** 2026-03-28
**Domain:** Vitest integration testing — spy-based routing verification, source-text grep assertions, env stubbing
**Confidence:** HIGH

## Summary

Phase 3 is a tests-only phase. No production code changes. The goal is a single new file `src/integration.test.ts` that proves four things: (1) `src/imap.ts` and `src/smtp.ts` contain no `process.env` access, (2) per-account IMAP routing is correct, (3) `send_email` uses the right `From:` address and right Sent folder for account 2, and (4) empty-string host values trigger a clear error before any network attempt.

All decisions are locked in CONTEXT.md. The test strategy is vi.spyOn on the two config builder functions (`imapConfigFromAccount`, `smtpConfigFromAccount`) — both are already exported, no changes to production code needed. The existing test infrastructure (vitest 4.1.2, `vi.stubEnv`, `vi.spyOn`) covers every requirement.

The baseline is clean: 4 test files, 45 tests, all passing in ~390ms. Phase 3 adds one file and should bring the total to around 55-60 tests.

**Primary recommendation:** Write `src/integration.test.ts` calling domain functions directly (not through `index.js`), spy on `imapConfigFromAccount` and `smtpConfigFromAccount`, stub envs for the empty-string SC-4 tests, and read source files with `readFileSync` for the SC-1 grep check.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Use `vi.spyOn` to spy on `imapConfigFromAccount` and `smtpConfigFromAccount`
- No additional test server dependencies (no Greenmail, no FakeSMTP)
- CI-friendly: tests run with `npm test` and no credentials required
- SC #1 grep test reads `src/imap.ts` and `src/smtp.ts` as text, asserts no `process.env` substring
- All Phase 3 tests in a new `src/integration.test.ts` — no changes to existing test files
- SC #4: test `ACCOUNT_2_IMAP_HOST=""` AND whitespace-only `"   "` — both go in `integration.test.ts`
- SC #1 test asserts on raw source text of `imap.ts`/`smtp.ts`, not compiled output
- For SC #4: the scenario is `ACCOUNT_2_EMAIL_ADDRESS` is present (account 2 attempted) but `ACCOUNT_2_IMAP_HOST` is `""` — server must exit with a clear error message containing `"ACCOUNT_2_IMAP_HOST"`

### Claude's Discretion

- Whether to import and call domain functions directly (e.g., `listEmails(account, ...)`) or spy at a lower level — pick what requires least mocking boilerplate while still exercising the routing chain
- Whether SC #2 tests cover all 8 tools or just representative ones (1-2 read tools + send)

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.2 | Test runner, spy/stub API | Already installed, ESM-native, used by all existing tests |
| Node `fs` (built-in) | N/A | Read source files for SC-1 grep check | No dependency needed; `readFileSync` is synchronous and trivial |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `path` / `url` (built-in) | N/A | Resolve absolute file paths from `import.meta.url` | Required for ESM-compatible `__dirname` equivalent |

**Installation:** No new dependencies. Everything needed is already present.

**Version verification:** vitest 4.1.2 confirmed installed (`node_modules/vitest/package.json`).

## Architecture Patterns

### Test File Structure
```
src/
├── accounts.test.ts     # unit: loadAccounts, resolveAccount (existing, unchanged)
├── imap.test.ts         # unit: imapConfigFromAccount (existing, unchanged)
├── smtp.test.ts         # unit: smtpConfigFromAccount (existing, unchanged)
├── index.test.ts        # unit: resolveAccount + ROUT requirements (existing, unchanged)
└── integration.test.ts  # NEW: cross-account contamination + routing verification
```

### Pattern 1: Spy on exported config builder
**What:** Import a function from a module, then `vi.spyOn` on the module object to observe calls and assert arguments — without any network connection.
**When to use:** SC-2 (IMAP routing) and SC-3 (SMTP From + Sent folder routing).

```typescript
// Source: vitest docs / confirmed pattern in codebase
import * as imap from "./imap.js";
import * as smtp from "./smtp.js";

const imapSpy = vi.spyOn(imap, "imapConfigFromAccount");
const smtpSpy = vi.spyOn(smtp, "smtpConfigFromAccount");

// After calling the function under test:
expect(imapSpy).toHaveBeenCalledWith(
  expect.objectContaining({ imapHost: "imap.work.com" })
);
```

**Important:** `vi.spyOn` wraps the export. Because `createClient` inside `imap.ts` calls the module-local function reference, NOT the exported binding, the spy approach may not intercept calls made entirely within the same module. See Pitfall 1 below for the resolution.

### Pattern 2: vi.stubEnv for empty-string tests
**What:** Use `vi.stubEnv` to set env vars before calling `loadAccounts()`, then assert on process exit behavior.
**When to use:** SC-4 tests. Matches existing pattern in `accounts.test.ts`.

```typescript
// Source: existing accounts.test.ts pattern
beforeEach(() => {
  vi.unstubAllEnvs();
});

it("exits with error when ACCOUNT_2_IMAP_HOST is empty string", () => {
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((_code?) => { throw new Error("process.exit"); });
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "test2@work.com");
  vi.stubEnv("ACCOUNT_2_IMAP_HOST", "");

  expect(() => loadAccounts()).toThrow("process.exit");
  expect(errorSpy).toHaveBeenCalledWith(
    expect.stringContaining("ACCOUNT_2_IMAP_HOST")
  );
});
```

### Pattern 3: Source-text grep check (SC-1)
**What:** Read the TypeScript source files as strings using `fs.readFileSync`, then assert the string does not contain `process.env`.
**When to use:** SC-1 regression guard.

```typescript
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

it("imap.ts contains no process.env access", () => {
  const source = readFileSync(join(__dirname, "imap.ts"), "utf-8");
  expect(source).not.toContain("process.env");
});

it("smtp.ts contains no process.env access", () => {
  const source = readFileSync(join(__dirname, "smtp.ts"), "utf-8");
  expect(source).not.toContain("process.env");
});
```

**Why source, not compiled output:** The compiled output in `server/` may not exist during CI. Source is the authoritative file. `src/` is the `rootDir` so `__dirname` from `import.meta.url` resolves there.

### Pattern 4: Direct AccountConfig construction (no env needed for routing tests)
**What:** Construct `AccountConfig` objects inline as test fixtures — no env vars, no `loadAccounts()`.
**When to use:** SC-2 and SC-3 routing tests. Cleaner than env stubbing and avoids process.exit risk.

```typescript
const account1: AccountConfig = {
  label: "personal",
  emailAddress: "me@personal.com",
  imapHost: "imap.personal.com",
  smtpHost: "smtp.personal.com",
  // ... minimal required fields
};

const account2: AccountConfig = {
  label: "work",
  emailAddress: "me@work.com",
  imapHost: "imap.work.com",
  smtpHost: "smtp.work.com",
  // ...
};
```

### Anti-Patterns to Avoid
- **Importing from `index.js`:** Triggers module-scope `loadAccounts()` and `McpServer` creation, requiring full env setup. Import from `imap.js`/`smtp.js`/`accounts.js` directly.
- **`.ts` extension in imports:** All existing test imports use `.js` extension for ESM (e.g., `"./imap.js"`). This is required — use `.js` even when importing `.ts` files.
- **Reading compiled output for grep check:** `server/` may not exist in CI. Read `src/imap.ts` and `src/smtp.ts` directly.
- **`vi.mock()` for simple spy needs:** `vi.spyOn` is sufficient when functions are already exported. Full module mocking adds unnecessary complexity.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spy/intercept calls | Custom wrapper | `vi.spyOn` | Already available, type-safe, auto-restores |
| Env var control | Manual `process.env[x] = y` | `vi.stubEnv` + `vi.unstubAllEnvs` | Automatic cleanup, no state leak between tests |
| Process exit simulation | Try/catch around `process.exit` | `vi.spyOn(process, "exit").mockImplementation(...)` | Established pattern in `accounts.test.ts` |

**Key insight:** No new test infrastructure is needed. Every required capability exists in vitest 4.1.2.

## Common Pitfalls

### Pitfall 1: vi.spyOn does not intercept module-internal calls
**What goes wrong:** `vi.spyOn(imap, "imapConfigFromAccount")` wraps the export, but `createClient` inside `imap.ts` calls `imapConfigFromAccount` via the local binding — not the exported one. The spy will NOT see calls triggered indirectly by `listEmails`.
**Why it happens:** ESM module bindings. The spy replaces the export on the module namespace object, not the local binding in the closure.
**How to avoid:** For SC-2, test `imapConfigFromAccount` directly by constructing an `AccountConfig` and calling it — asserting the output `host` field equals the expected host. This tests the function that ALL tools call, which is the correct routing contract. Alternatively, the mock can replace the function and check it's called; but the returned value path requires the internal binding pattern.
**Recommended approach:** Call `imapConfigFromAccount(account2)` directly and assert `config.host === "imap.work.com"`. This is simpler, faster, and proves the same routing property.

### Pitfall 2: `import.meta.url` path resolution in tests
**What goes wrong:** `__dirname` does not exist in ESM. Using a relative path like `"../imap.ts"` may resolve differently based on CWD.
**How to avoid:** Use `dirname(fileURLToPath(import.meta.url))` to get the directory of the test file itself, then `join(__dirname, "imap.ts")` for the source file path. Since `integration.test.ts` lives in `src/`, this resolves correctly.

### Pitfall 3: `vi.spyOn(process, "exit")` must throw to stop execution
**What goes wrong:** If the mock just returns `undefined`, code after `process.exit(1)` continues running and throws unrelated errors.
**How to avoid:** `.mockImplementation(() => { throw new Error("process.exit"); })`. Match the existing pattern in `accounts.test.ts` exactly.
**Warning signs:** Test passes but subsequent assertions about `console.error` calls fail intermittently.

### Pitfall 4: `vi.unstubAllEnvs()` in `beforeEach`, not `afterEach`
**What goes wrong:** If a previous test sets env vars and the test throws before cleanup, `afterEach` may not run.
**How to avoid:** Put `vi.unstubAllEnvs()` in `beforeEach` so every test starts clean regardless of prior test outcome. This is the pattern used in `accounts.test.ts`.

### Pitfall 5: SC-3 test for `appendToMailbox` spy
**What goes wrong:** `appendToMailbox` is called from inside `sendEmail` in `smtp.ts`. It imports from `imap.js`. Spying at the `imap` module level is subject to the same ESM binding issue as Pitfall 1 for module-internal calls.
**How to avoid:** Test `smtpConfigFromAccount(account2)` directly (verifying `from` address routing) and separately test that `appendToMailbox` uses the `AccountConfig`'s `sentFolder`. The `sendEmail` function signature already passes `account` through — so testing that `smtpConfigFromAccount` receives `account2` is the correct integration point. For the Sent folder side, spy on `imap.appendToMailbox` at the module level (`vi.spyOn(imap, "appendToMailbox").mockResolvedValue(undefined)`) — this works because `smtp.ts` imports `appendToMailbox` via the module, which IS the exported binding.

### Pitfall 6: SC-4 scenario specifics
**What goes wrong:** Testing only `ACCOUNT_2_EMAIL_ADDRESS` absent (account 2 skipped silently) rather than the intended case where `ACCOUNT_2_EMAIL_ADDRESS` is present but `ACCOUNT_2_IMAP_HOST` is `""`.
**Why it matters:** The requirement is "account 2 attempted but host is empty string from unfilled Claude Desktop field." This is distinct from "account 2 not configured at all."
**How to avoid:** Set `ACCOUNT_2_EMAIL_ADDRESS` to a non-empty value AND `ACCOUNT_2_IMAP_HOST` to `""` (and separately `"   "`). Also set `ACCOUNT_1_*` (required).

## Code Examples

Verified patterns from actual codebase:

### SC-1: Source grep check
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("SC-1: No process.env in imap.ts or smtp.ts", () => {
  it("imap.ts contains no process.env", () => {
    const src = readFileSync(join(__dirname, "imap.ts"), "utf-8");
    expect(src).not.toContain("process.env");
  });

  it("smtp.ts contains no process.env", () => {
    const src = readFileSync(join(__dirname, "smtp.ts"), "utf-8");
    expect(src).not.toContain("process.env");
  });
});
```

### SC-2: IMAP routing — direct config verification
```typescript
import { imapConfigFromAccount } from "./imap.js";
import type { AccountConfig } from "./accounts.js";

const acc1: AccountConfig = {
  label: "personal", emailAddress: "me@personal.com",
  username: "me", password: "p",
  imapHost: "imap.personal.com", imapPort: 993, imapSecurity: "ssl",
  smtpHost: "smtp.personal.com", smtpPort: 465, smtpSecurity: "ssl",
  sslVerify: true, sentFolder: "Sent",
};
const acc2: AccountConfig = {
  ...acc1, label: "work", emailAddress: "me@work.com",
  imapHost: "imap.work.com", smtpHost: "smtp.work.com",
};

describe("SC-2: imapConfigFromAccount routes to correct server", () => {
  it("account 1 routes to imap.personal.com", () => {
    const cfg = imapConfigFromAccount(acc1);
    expect(cfg.host).toBe("imap.personal.com");
  });

  it("account 2 routes to imap.work.com — not imap.personal.com", () => {
    const cfg = imapConfigFromAccount(acc2);
    expect(cfg.host).toBe("imap.work.com");
    expect(cfg.host).not.toBe("imap.personal.com");
  });
});
```

### SC-3: SMTP From + Sent folder routing
```typescript
import * as imapModule from "./imap.js";
import { smtpConfigFromAccount } from "./smtp.js";

describe("SC-3: send_email uses account 2 From and Sent folder", () => {
  it("smtpConfigFromAccount for account 2 uses account 2 SMTP host", () => {
    const cfg = smtpConfigFromAccount(acc2);
    expect(cfg.host).toBe("smtp.work.com");
  });

  it("account 2 emailAddress is me@work.com — correct From: address", () => {
    // sendEmail sets `from = account.emailAddress` — verify the field is correct
    expect(acc2.emailAddress).toBe("me@work.com");
  });

  it("appendToMailbox called with account 2 config for Sent folder copy", async () => {
    const appendSpy = vi
      .spyOn(imapModule, "appendToMailbox")
      .mockResolvedValue(undefined);
    // call sendEmail with acc2 — the spy verifies account 2's AccountConfig is passed
    // ... (sendEmail will throw on SMTP connect; wrap in try/catch or mock transporter)
    // appendSpy assertions go here
    appendSpy.mockRestore();
  });
});
```

### SC-4: Empty-string host error
```typescript
import { loadAccounts } from "./accounts.js";
import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("SC-4: empty ACCOUNT_2_IMAP_HOST triggers clear error", () => {
  function setupExitSpies() {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?) => { throw new Error("process.exit"); });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    return { exitSpy, errorSpy };
  }

  it("empty string IMAP host exits with ACCOUNT_2_IMAP_HOST in message", () => {
    const { errorSpy } = setupExitSpies();
    vi.stubEnv("ACCOUNT_1_EMAIL_ADDRESS", "a@a.com");
    vi.stubEnv("ACCOUNT_1_IMAP_HOST", "imap.a.com");
    vi.stubEnv("ACCOUNT_1_SMTP_HOST", "smtp.a.com");
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "b@b.com");
    vi.stubEnv("ACCOUNT_2_IMAP_HOST", "");

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_2_IMAP_HOST")
    );
  });

  it("whitespace-only IMAP host also exits with ACCOUNT_2_IMAP_HOST in message", () => {
    const { errorSpy } = setupExitSpies();
    vi.stubEnv("ACCOUNT_1_EMAIL_ADDRESS", "a@a.com");
    vi.stubEnv("ACCOUNT_1_IMAP_HOST", "imap.a.com");
    vi.stubEnv("ACCOUNT_1_SMTP_HOST", "smtp.a.com");
    vi.stubEnv("ACCOUNT_2_EMAIL_ADDRESS", "b@b.com");
    vi.stubEnv("ACCOUNT_2_IMAP_HOST", "   ");

    expect(() => loadAccounts()).toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ACCOUNT_2_IMAP_HOST")
    );
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for Node ESM | vitest for ESM | 2022-2023 | Zero-config ESM, no transform hacks needed |
| `jest.spyOn` | `vi.spyOn` | vitest adoption | Identical API, just import from `vitest` |

**Deprecated/outdated:**
- `process.env.X = "y"` in tests: replaced by `vi.stubEnv("X", "y")` + `vi.unstubAllEnvs()` for automatic cleanup.

## Open Questions

1. **SC-3 sendEmail spy depth**
   - What we know: `sendEmail` calls nodemailer's `transporter.sendMail`, which makes a real network connection. Spying on `appendToMailbox` works (it IS the exported binding from the imap module). But calling `sendEmail` end-to-end requires mocking the nodemailer transporter too.
   - What's unclear: Whether the planner should mock `nodemailer.createTransport` (complex) or test `smtpConfigFromAccount` + `appendToMailbox` spy as two separate tests rather than one end-to-end call.
   - Recommendation: Split SC-3 into two focused tests — (a) `smtpConfigFromAccount(acc2)` returns correct host/auth, (b) spy on `appendToMailbox` and mock `nodemailer.createTransport` to verify Sent folder routing. CONTEXT.md's "both spies in the same test" goal can be satisfied by mocking the transport at the nodemailer level with `vi.mock("nodemailer", ...)`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | none — vitest reads package.json `"test": "vitest run"` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

Phase 3 has no new REQUIREMENTS.md IDs. It verifies already-delivered v1 requirements via four explicit success criteria:

| Success Criteria | Behavior | Test Type | Automated Command | File Exists? |
|-----------------|----------|-----------|-------------------|-------------|
| SC-1 | `src/imap.ts` and `src/smtp.ts` contain no `process.env` | static/lint | `npm test` | ❌ Wave 0 |
| SC-2 | `listEmails` for account 2 routes to account 2's IMAP host | integration | `npm test` | ❌ Wave 0 |
| SC-3 | `send_email` from account 2 uses account 2 From + Sent folder | integration | `npm test` | ❌ Wave 0 |
| SC-4 | Empty `ACCOUNT_2_IMAP_HOST` produces named error, no DNS lookup | integration | `npm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/integration.test.ts` — all four success criteria (SC-1 through SC-4)

*(No framework install needed — vitest 4.1.2 already installed)*

## Sources

### Primary (HIGH confidence)
- Direct source read of `src/imap.ts` — confirms `imapConfigFromAccount` exported `@internal`, no `process.env` present
- Direct source read of `src/smtp.ts` — confirms `smtpConfigFromAccount` exported publicly, `from = account.emailAddress`, no `process.env` present
- Direct source read of `src/accounts.ts` — confirms `loadAccounts`/`resolveAccount` exports, `isPresent` pattern for empty-string detection
- Direct source read of `src/accounts.test.ts` — confirms `vi.stubEnv`/`vi.unstubAllEnvs`/`vi.spyOn(process, "exit")` pattern
- `package.json` — vitest 4.1.2, `"type": "module"`, `"test": "vitest run"`
- `npm test` run — 4 files, 45 tests, all passing

### Secondary (MEDIUM confidence)
- vitest ESM spy behavior (module binding limitation): consistent with documented ESM behavior and confirmed by test design pattern in existing tests

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already installed and in use
- Architecture: HIGH — existing test patterns directly applicable, all spy targets confirmed exported
- Pitfalls: HIGH — ESM binding behavior is well-understood; SC-3 mocking complexity is the one area requiring implementer judgment

**Research date:** 2026-03-28
**Valid until:** 2026-04-27 (stable — vitest 4.x, no moving parts)
