---
phase: 02-implementation
plan: "03"
subsystem: config
tags: [manifest, multi-account, mcp, user_config]

requires: []
provides:
  - manifest.json with account_1_* user_config fields replacing legacy single-account fields
  - manifest.json with optional account_2_* and account_3_* blocks (required: false) including label fields
  - mcp_config.env block mapping all user_config fields to ACCOUNT_N_* environment variables
affects: [02-04, 02-05, 02-06]

tech-stack:
  added: []
  patterns:
    - "account_N_ prefix pattern for multi-account manifest fields"
    - "label field per account for human-readable account identification"

key-files:
  created: []
  modified:
    - manifest.json

key-decisions:
  - "account_1_sent_folder included in user_config for forward compatibility with sent-email appending (EXT-02)"
  - "account_2_label and account_3_label fields added to support human-readable account references in tool params"

patterns-established:
  - "account_N_field_name pattern: all account fields prefixed with account_N_ in user_config and ACCOUNT_N_ in env"

requirements-completed: [MFST-01, MFST-02]

duration: 5min
completed: 2026-03-28
---

# Phase 02 Plan 03: Manifest Multi-Account Configuration Summary

**manifest.json migrated from legacy single-account fields to indexed account_1/2/3 fields with full ACCOUNT_N_* env mappings for Claude Desktop multi-account UI**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-28T07:24:00Z
- **Completed:** 2026-03-28T07:24:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced all legacy user_config keys (email_address, email_password, imap_host, smtp_host, etc.) with account_1_* equivalents, preserving required: true on the 4 critical fields
- Added optional account_2_* block (12 fields including label) and account_3_* block (identical structure) with required: false on all fields
- Replaced legacy mcp_config.env block (10 entries) with full ACCOUNT_N_* mappings (34 entries covering all 3 accounts)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate manifest.json to multi-account configuration** - `51dc21c` (feat)

**Plan metadata:** _(to follow in final commit)_

## Files Created/Modified
- `manifest.json` - Fully rewritten user_config and mcp_config.env sections for 3-account support

## Decisions Made
- `account_1_sent_folder` included in user_config (plan listed it as "Claude's Discretion") — included for forward compatibility with the send-email flow that appends to Sent folder (EXT-02 dependency)
- Label fields (account_2_label, account_3_label) included as the first field in each optional block, matching the design established in Phase 01's AccountConfig type

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
Node's -e flag shell-escaped `!` characters in the zsh verification command — ran verification using --input-type=module heredoc instead. No impact on output.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- manifest.json exposes all ACCOUNT_N_* env vars that accounts.ts (02-01) reads
- Claude Desktop users can now configure up to 3 accounts through the standard UI
- Ready for 02-04 (IMAP multi-account), 02-05 (SMTP multi-account), 02-06 (tool routing)

---
*Phase: 02-implementation*
*Completed: 2026-03-28*
