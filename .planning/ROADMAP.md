# Roadmap: email-mcp Multi-Account Support

## Overview

This milestone extends the existing single-account email-mcp server to support 1–3 named email accounts in one server instance. The work is a pure structural refactor: a new `src/accounts.ts` module centralizes all config loading and account resolution, the domain modules (`imap.ts`, `smtp.ts`) are updated to accept an explicit `AccountConfig` parameter instead of reading `process.env` directly, and all 8 MCP tools gain an optional `account` parameter. Backward compatibility for existing single-account deployments is maintained throughout. Three phases deliver this in dependency order: foundation, implementation, verification.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Account Config Foundation** - Build `src/accounts.ts` with types, loader, and resolver — everything else depends on this (completed 2026-03-28)
- [ ] **Phase 2: Implementation** - Refactor domain layer and wire account routing into all 8 tools and the manifest
- [ ] **Phase 3: Verification** - Integration tests confirm correct account routing with no cross-account contamination

## Phase Details

### Phase 1: Account Config Foundation
**Goal**: `AccountConfig` type and account loading/resolution functions exist and are fully correct — domain layer refactor can begin
**Depends on**: Nothing (first phase)
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04
**Success Criteria** (what must be TRUE):
  1. Server starts with only legacy env vars (`EMAIL_ADDRESS`, `IMAP_HOST`, etc.) and produces a valid account 1 config with label "account1"
  2. Server starts with `ACCOUNT_1_*` indexed env vars and produces a valid account 1 config using those values (indexed vars take precedence over legacy)
  3. Server starts with `ACCOUNT_1_*` and `ACCOUNT_2_*` and produces two distinct `AccountConfig` entries in the loaded array
  4. Server refuses to start if account 1 required fields are missing, printing a clear error naming which field is absent
  5. `resolveAccount` returns an error listing all valid labels when given an unknown account name, and defaults to account 1 when `account` is undefined
**Plans:** 2/2 plans complete
Plans:
- [x] 01-01-PLAN.md — TDD build of src/accounts.ts (types, loadAccounts, resolveAccount) with vitest
- [x] 01-02-PLAN.md — Wire loadAccounts() into src/index.ts startup

### Phase 2: Implementation
**Goal**: All 8 MCP tools correctly route operations to the selected account; no `process.env` reads remain in `imap.ts` or `smtp.ts`; manifest updated for multi-account config
**Depends on**: Phase 1
**Requirements**: ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05, MFST-01, MFST-02
**Success Criteria** (what must be TRUE):
  1. Calling any tool without the `account` param operates on account 1 — identical behavior to the pre-refactor single-account server
  2. Calling a tool with `account: "pro"` (or `account: 2`) operates on account 2's IMAP/SMTP servers, not account 1's
  3. Calling `send_email` with `account: "pro"` sends from account 2's email address and saves the sent copy to account 2's Sent folder
  4. Calling any tool with an unknown `account` value returns an error that lists valid configured account labels
  5. All tool responses that return UIDs include the account label, so Claude can track which account owns each UID
  6. `manifest.json` and `mcp_config.env` expose optional account 2 and account 3 config fields; a server configured with only account 1 fields starts without errors
**Plans:** 2/4 plans executed
Plans:
- [ ] 02-00-PLAN.md — Wave 0 test scaffold for index.ts routing behavior (ROUT-01, ROUT-02, ROUT-04, ROUT-05)
- [ ] 02-01-PLAN.md — Refactor imap.ts and smtp.ts to accept AccountConfig (domain layer parameterization)
- [ ] 02-02-PLAN.md — Wire account routing into all 8 MCP tool handlers in index.ts
- [ ] 02-03-PLAN.md — Migrate manifest.json to multi-account configuration

### Phase 3: Verification
**Goal**: Integration tests confirm no cross-account contamination exists and all critical pitfalls from research are explicitly exercised
**Depends on**: Phase 2
**Requirements**: (none — all v1 requirements delivered in Phases 1 and 2; this phase validates they work together correctly)
**Success Criteria** (what must be TRUE):
  1. A grep for `process.env` in `src/imap.ts` and `src/smtp.ts` returns zero matches
  2. Test: configure two accounts with different IMAP servers, run `list_emails` for each — each call hits the correct server
  3. Test: `send_email` from account 2 — sent message has account 2's `From:` address AND appears in account 2's Sent folder (not account 1's)
  4. Test: set `ACCOUNT_2_IMAP_HOST=""` (empty string from unfilled Claude Desktop field), call any tool with `account: 2` — server returns a clear "account 2 is not configured" error, does not attempt a DNS lookup
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Account Config Foundation | 2/2 | Complete   | 2026-03-28 |
| 2. Implementation | 2/4 | In Progress|  |
| 3. Verification | 0/TBD | Not started | - |
