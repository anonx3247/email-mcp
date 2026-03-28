---
phase: 01-account-config-foundation
plan: 02
subsystem: config
tags: [typescript, mcp, accounts, env-vars, multi-account]

# Dependency graph
requires:
  - phase: 01-account-config-foundation/01-01
    provides: loadAccounts() and AccountConfig interface in src/accounts.ts
provides:
  - src/index.ts wires loadAccounts() at startup, replacing legacy inline env var block
  - accounts const declared at module scope for Phase 2 tool handler wiring
  - startup log prints all account labels, emails, IMAP, and SMTP info
affects:
  - phase-02 (tool handlers will consume the module-scoped accounts const)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "loadAccounts() called once at module scope, result stored in module-level const for use by tool handlers"
    - "Startup log iterates accounts array to display all loaded accounts"

key-files:
  created: []
  modified:
    - src/index.ts

key-decisions:
  - "accounts const placed at module scope so Phase 2 can reference it in tool handlers without refactoring"
  - "No changes to tool handler signatures in this plan — Phase 2 handles that wiring"

patterns-established:
  - "Module-scope accounts array: loadAccounts() result is module-level, enabling tool handler access"

requirements-completed: [CONF-03, CONF-04]

# Metrics
duration: 1min
completed: 2026-03-28
---

# Phase 01 Plan 02: index.ts Integration Summary

**Replaced 34-line inline env var validation block in index.ts with a single loadAccounts() call, wiring the accounts module into the server entry point**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-28T06:34:52Z
- **Completed:** 2026-03-28T06:35:47Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed all direct `process.env` reads from `src/index.ts` (verified with `grep -c "process.env" src/index.ts` = 0)
- Added `import { loadAccounts } from "./accounts.js"` and `const accounts = loadAccounts()` at module scope
- Startup log now iterates loaded accounts showing label, email, IMAP host/port/security, SMTP host/port/security
- All checks pass: typecheck, lint, build, 18 vitest tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace index.ts startup validation with loadAccounts()** - `8ed41f6` (feat)

**Plan metadata:** _(docs commit to follow)_

## Files Created/Modified

- `src/index.ts` - Replaced inline env var block with loadAccounts() call and multi-account startup log

## Decisions Made

- `accounts` const declared at module scope (not inside `main()`) so Phase 2 tool handlers can reference it without restructuring
- No changes to tool handler signatures in this plan — those remain for Phase 2

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 01 is complete: accounts.ts foundation (plan 01) and index.ts integration (plan 02) are done
- Phase 2 can now consume the module-scoped `accounts` const in tool handlers
- Key blockers documented in STATE.md remain relevant for Phase 2:
  - `smtp.ts` line 63 reads `process.env["EMAIL_ADDRESS"]` directly — must become `account.emailAddress`
  - `appendToMailbox` inside `sendEmail` must pass the same `AccountConfig` through
  - Empty string env vars from Claude Desktop — use `.trim().length > 0` checks

---
*Phase: 01-account-config-foundation*
*Completed: 2026-03-28*

## Self-Check: PASSED

- `src/index.ts` — FOUND
- `01-02-SUMMARY.md` — FOUND
- Commit `8ed41f6` — FOUND
