---
phase: 2
slug: implementation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | none — vitest zero-config |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck && npm test`
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | ROUT-01,02,04,05 | unit | `npm test -- src/index.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 0 | ROUT-01 | unit | `npm test -- src/imap.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 0 | ROUT-01 | unit | `npm test -- src/smtp.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | ROUT-01 | typecheck | `npm run typecheck` | ✅ | ⬜ pending |
| 2-02-02 | 02 | 1 | ROUT-01 | typecheck | `npm run typecheck` | ✅ | ⬜ pending |
| 2-03-01 | 03 | 2 | ROUT-01,02,03,04,05 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 3 | MFST-01,02 | manual | inspect `manifest.json` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/index.test.ts` — covers ROUT-01, ROUT-02, ROUT-04, ROUT-05 (mock resolveAccount and domain functions; verify routing and response shape including `account` field)
- [ ] `src/imap.test.ts` — covers `imapConfigFromAccount` correctness (ssl/starttls/none modes, port handling, auth presence)
- [ ] `src/smtp.test.ts` — covers `smtpConfigFromAccount` correctness and `from` field sourced from `account.emailAddress`

Existing: `src/accounts.test.ts` ✅ — covers ROUT-03 via `resolveAccount` case-insensitivity tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `manifest.json` has `account_1_*` fields replacing legacy fields | MFST-01 | JSON file edit, not runtime code | Open `manifest.json`; confirm no legacy keys (`email_address`, `email_password`, etc.); confirm `account_1_email_address` and equivalents present with correct `required: true/false` |
| `mcp_config.env` maps all `ACCOUNT_N_*` vars | MFST-02 | JSON file edit | Open `manifest.json` `mcp_config.env` block; confirm all 32 `ACCOUNT_1_*`, `ACCOUNT_2_*`, `ACCOUNT_3_*` mappings present |
| Server starts with only account 1 env vars set | MFST-01 | Requires live runtime | Set only `ACCOUNT_1_*` vars; run `npm run start`; confirm no startup error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
