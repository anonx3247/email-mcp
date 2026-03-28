---
phase: 1
slug: account-config-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (to be installed in Wave 0) |
| **Config file** | vitest.config.ts — Wave 0 installs |
| **Quick run command** | `npx vitest run src/accounts.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/accounts.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | CONF-01 | infra | `npx vitest run src/accounts.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | CONF-01 | unit | `npx vitest run src/accounts.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | CONF-02 | unit | `npx vitest run src/accounts.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | CONF-03 | unit | `npx vitest run src/accounts.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | CONF-04 | unit | `npx vitest run src/accounts.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` — install as dev dependency (`npm install -D vitest`)
- [ ] `src/accounts.test.ts` — stubs for CONF-01 through CONF-04
- [ ] `vitest.config.ts` — ESM-compatible vitest configuration

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Server startup log output | CONF-03 | process.exit() in test env needs vi.spyOn | Run `node dist/index.js` without required env vars, verify error message names missing field |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
