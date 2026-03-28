# Phase 3: Verification - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `src/integration.test.ts` with tests confirming no cross-account contamination and explicitly exercising all four success criteria from ROADMAP.md. No new production code — this phase is tests only.

</domain>

<decisions>
## Implementation Decisions

### Integration test strategy
- Use `vi.spyOn` to spy on `imapConfigFromAccount` and `smtpConfigFromAccount` — assert the correct `AccountConfig` object was passed through for each account
- This verifies the full routing chain without making real network connections
- No additional test server dependencies (no Greenmail, no FakeSMTP)
- CI-friendly: tests run with `npm test` and no credentials required

### What to verify for SC #2 (list_emails routing)
- Spy on `imapConfigFromAccount` and assert it was called with the correct account's `AccountConfig` (e.g., `imapHost: "imap.work.com"` not `"imap.personal.com"`)
- Tests two-account scenario: account 1 call stays on account 1's config, account 2 call uses account 2's config

### What to verify for SC #3 (send_email from account 2)
- Spy on `smtpConfigFromAccount` to assert From: address comes from account 2 (`emailAddress` field)
- Spy on `imapConfigFromAccount` (called inside `appendToMailbox`) to assert account 2's IMAP config is used for the Sent folder copy
- Both spies in the same test to confirm both sides of the contamination boundary

### SC #1 grep check — automate as a test
- Write a vitest test in `integration.test.ts` that reads `src/imap.ts` and `src/smtp.ts` as text and asserts no `process.env` substring is present
- Runs with `npm test`, acts as a regression guard so a future accidental direct env read is caught immediately

### SC #4 empty-string tests
- Add explicit `vi.stubEnv("ACCOUNT_2_IMAP_HOST", "")` tests in addition to the existing undefined case in `accounts.test.ts`
- Also test whitespace-only `"   "` to cover the Claude Desktop injection pattern
- These go in `integration.test.ts` as part of the Phase 3 suite

### Test file location
- All Phase 3 tests in a new `src/integration.test.ts`
- Keeps a clean boundary: unit tests (config shapes, resolveAccount) in existing files; contamination/routing/grep tests here
- No changes to existing test files

### Claude's Discretion
- Whether to import and call domain functions directly (e.g., `listEmails(account, ...)`) or spy at a lower level — pick what requires least mocking boilerplate while still exercising the routing chain
- Whether SC #2 tests cover all 8 tools or just representative ones (1-2 read tools + send)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements and success criteria
- `.planning/ROADMAP.md` §"Phase 3: Verification" — all four success criteria are the acceptance tests for this phase
- `.planning/REQUIREMENTS.md` — ROUT-01 through ROUT-05 define the routing requirements being verified

### Prior phase decisions (already implemented)
- `.planning/phases/01-account-config-foundation/01-CONTEXT.md` — `AccountConfig` type shape, `loadAccounts` behavior, empty string check pattern
- `.planning/phases/02-implementation/02-CONTEXT.md` — `imapConfigFromAccount`/`smtpConfigFromAccount` signatures, `appendToMailbox` gaining `AccountConfig` param, tool response shape

### Codebase patterns
- `src/imap.ts` — `imapConfigFromAccount(account: AccountConfig)` signature (spy target for SC #2)
- `src/smtp.ts` — `smtpConfigFromAccount(account: AccountConfig)` and `sendEmail` signature (spy target for SC #3)
- `src/accounts.test.ts` — existing vitest pattern for env stubbing and process.exit mocking (follow same approach for SC #4)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vi.stubEnv` / `vi.unstubAllEnvs` pattern from `accounts.test.ts` — use same pattern for SC #4 empty-string tests
- `vi.spyOn(process, "exit").mockImplementation(...)` pattern from `accounts.test.ts` — reuse for startup error tests
- `imapConfigFromAccount` (exported `@internal`) and `smtpConfigFromAccount` (exported publicly) — both already exported, directly spy-able

### Established Patterns
- Tests use `.js` extension imports (ESM), not `.ts`
- Tests import `resolveAccount` directly from `accounts.js`, not through `index.js` (avoids module-scope side effects: `loadAccounts()` + `McpServer` creation)
- Same isolation applies to `integration.test.ts` — import domain functions (`listEmails`, `sendEmail`, etc.) directly from `imap.js`/`smtp.js`, not through `index.js`

### Integration Points
- `src/imap.ts` exports: `imapConfigFromAccount`, `listMailboxes`, `listEmails`, `fetchEmail`, `searchEmails`, `moveEmail`, `markEmail`, `deleteEmail`
- `src/smtp.ts` exports: `smtpConfigFromAccount`, `sendEmail`
- SC #1 grep test reads files from disk — use `fs.readFileSync` or `import { readFileSync } from "fs"`

</code_context>

<specifics>
## Specific Ideas

- SC #1 test should assert on the raw source text of imap.ts and smtp.ts, not the compiled output — test the source of truth
- For SC #4: the scenario is ACCOUNT_2_EMAIL_ADDRESS is present (account 2 attempted) but ACCOUNT_2_IMAP_HOST is "" — server must exit with a clear error message containing "ACCOUNT_2_IMAP_HOST"

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-verification*
*Context gathered: 2026-03-28*
