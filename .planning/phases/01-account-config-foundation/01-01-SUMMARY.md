---
phase: 01-account-config-foundation
plan: 01
subsystem: config
tags: [vitest, typescript, environment-variables, multi-account]

requires: []
provides:
  - AccountConfig interface with all fields for IMAP/SMTP connection config
  - SecurityMode type (ssl | starttls | none)
  - loadAccounts() — reads env vars, supports legacy and indexed ACCOUNT_N_* modes
  - resolveAccount() — resolves by undefined/string/number with case-insensitive matching
affects:
  - phase: 02-tool-refactor
    reason: All tools must accept AccountConfig param instead of reading env vars directly

tech-stack:
  added: [vitest@4.1.2]
  patterns:
    - "isPresent(str) checks via .trim().length > 0 — handles empty string env vars from Claude Desktop"
    - "requireStr() calls console.error + process.exit(1) for validation failures"
    - "Indexed ACCOUNT_N_* env vars take precedence over legacy bare vars when ACCOUNT_1_EMAIL_ADDRESS is set"

key-files:
  created:
    - src/accounts.ts
    - src/accounts.test.ts
  modified:
    - package.json

key-decisions:
  - "vitest chosen as test runner — ESM-native, zero-config for this project"
  - "password field is NOT required (empty string is valid) — matches existing imap.ts/smtp.ts behavior"
  - "resolveAccount by number matches label 'accountN' pattern — e.g., 2 matches 'account2'"
  - "Accounts 2 and 3 are checked via sentinel loop; account 1 is always loaded"

patterns-established:
  - "isPresent(value) for empty-string-safe presence checks throughout Phase 2"
  - "ACCOUNT_N_ prefix with numeric suffix for all indexed env vars"
  - "console.error + process.exit(1) for config validation (not throw) — consistent with startup failure pattern"

requirements-completed: [CONF-01, CONF-02, CONF-03, CONF-04]

duration: 3min
completed: 2026-03-28
---

# Phase 01 Plan 01: Account Config Foundation Summary

**AccountConfig type + loadAccounts()/resolveAccount() with legacy fallback, indexed multi-account mode, and validation via vitest-covered unit tests (18 passing)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T06:32:50Z
- **Completed:** 2026-03-28T06:33:01Z
- **Tasks:** 2
- **Files modified:** 3 (src/accounts.ts, src/accounts.test.ts, package.json)

## Accomplishments

- Installed vitest and added `test` script; 18 tests covering all CONF-01 through CONF-04 requirements
- Implemented `loadAccounts()` supporting legacy bare env vars and indexed `ACCOUNT_N_*` vars with automatic sentinel detection
- Implemented `resolveAccount()` with undefined/string/number resolution and case-insensitive label matching
- Validation errors name the specific missing env var and call `process.exit(1)`, consistent with server startup failure pattern

## Task Commits

1. **Task 1: Install vitest and create test scaffold with all failing tests** - `07994cf` (test)
2. **Task 2: Implement loadAccounts() and resolveAccount() to pass all tests** - `c254c32` (feat)

_Note: TDD plan — Task 1 = RED commit, Task 2 = GREEN commit_

## Files Created/Modified

- `src/accounts.ts` — AccountConfig interface, SecurityMode type, loadAccounts(), resolveAccount()
- `src/accounts.test.ts` — 18 unit tests covering all CONF requirements and resolveAccount behaviors
- `package.json` — Added vitest devDependency and "test" script

## Decisions Made

- vitest chosen as test runner — ESM-native, no additional config needed for this ESM project
- `password` field is not validated as required (empty string is valid) — matches behavior of existing imap.ts/smtp.ts where empty password is passed as-is
- `resolveAccount(accounts, 2)` matches label `"account2"` — numeric lookup by position convention
- Accounts are hard-capped at 3 in `loadAccounts()` loop (`[2, 3] as const`) — matches research decision in STATE.md

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Account config is loaded from env vars at runtime.

## Next Phase Readiness

- `src/accounts.ts` is ready for import by Phase 2 tool refactor
- All tools in `src/index.ts`, `src/imap.ts`, `src/smtp.ts` currently read env vars directly — Phase 2 must thread `AccountConfig` through each tool call
- Key pitfall documented in STATE.md: `smtp.ts` line 63 reads `process.env["EMAIL_ADDRESS"]` directly for the `from` field — must become `account.emailAddress`

---
*Phase: 01-account-config-foundation*
*Completed: 2026-03-28*
