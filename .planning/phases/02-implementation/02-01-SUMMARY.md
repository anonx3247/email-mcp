---
phase: 02-implementation
plan: "01"
subsystem: imap-smtp-domain
tags: [refactor, account-config, tdd, imap, smtp]
dependency_graph:
  requires: []
  provides: [account-parameterized-imap, account-parameterized-smtp]
  affects: [src/index.ts]
tech_stack:
  added: []
  patterns: [AccountConfig-first-parameter, imapConfigFromAccount, smtpConfigFromAccount]
key_files:
  created:
    - src/imap.test.ts
    - src/smtp.test.ts
  modified:
    - src/imap.ts
    - src/smtp.ts
decisions:
  - imapConfigFromAccount exported with @internal JSDoc to allow test import without index barrel
  - smtpConfigFromAccount exported normally (public utility for testing and future callers)
  - SecurityMode removed from both files and imported from accounts.ts only
metrics:
  duration_seconds: 131
  completed_date: "2026-03-28"
  tasks_completed: 2
  files_modified: 4
requirements:
  - ROUT-01
---

# Phase 2 Plan 1: imap.ts and smtp.ts AccountConfig Parameterization Summary

**One-liner:** Replaced process.env reads in imap.ts and smtp.ts with AccountConfig parameter injection, enabling per-account routing via imapConfigFromAccount/smtpConfigFromAccount builders.

## What Was Built

Both IMAP and SMTP domain modules were refactored to accept an `AccountConfig` as their first parameter instead of reading from `process.env`. This is the foundational change for multi-account support.

### imap.ts changes

- Removed local `type SecurityMode` — now imported from `accounts.ts`
- Removed `getImapConfig()` function that read `process.env` directly
- Added `imapConfigFromAccount(account: AccountConfig): ImapFlowOptions` (exported `@internal`)
- Updated `createClient` to `createClient(account: AccountConfig)`
- All 8 exported functions now take `account: AccountConfig` as first parameter: `appendToMailbox`, `listMailboxes`, `listEmails`, `fetchEmail`, `searchEmails`, `moveEmail`, `deleteEmail`, `markEmail`

### smtp.ts changes

- Removed local `type SecurityMode`
- Removed `getSmtpConfig()` function
- Added `smtpConfigFromAccount(account: AccountConfig): SMTPTransport.Options` (exported)
- Updated `sendEmail` to take `account: AccountConfig` as first parameter
- `from` field now uses `account.emailAddress` (not `process.env["EMAIL_ADDRESS"]`)
- `sentFolder` now uses `account.sentFolder` (not `process.env["SENT_FOLDER"]`)
- `appendToMailbox` call now passes `account` as first argument

### Tests added

- `src/imap.test.ts` — 5 tests for `imapConfigFromAccount`: SSL mode, STARTTLS mode, none+empty password, none+non-empty password, sslVerify=false
- `src/smtp.test.ts` — 5 tests for `smtpConfigFromAccount`: SSL mode, STARTTLS mode, none+empty password, sslVerify=false, port mapping

## Commits

| Hash | Description |
|------|-------------|
| 4996dd2 | feat(02-01): refactor imap.ts to accept AccountConfig as first parameter |
| 074c27f | feat(02-01): refactor smtp.ts to accept AccountConfig as first parameter |

## Verification

- `grep -c "process.env" src/imap.ts` → 0
- `grep -c "process.env" src/smtp.ts` → 0
- `grep -c "type SecurityMode" src/imap.ts` → 0
- `grep -c "type SecurityMode" src/smtp.ts` → 0
- `npx vitest run src/imap.test.ts src/smtp.test.ts` → 10/10 tests pass
- `grep "account: AccountConfig" src/imap.ts | wc -l` → 10
- `grep "account: AccountConfig" src/smtp.ts | wc -l` → 2
- Typecheck errors exist only in `src/index.ts` call sites (expected — fixed in Plan 02)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files confirmed present. All commits confirmed in git log.
