# Project Research Summary

**Project:** email-mcp multi-account support
**Domain:** MCP server extension — multi-account IMAP/SMTP routing
**Researched:** 2026-03-28
**Confidence:** HIGH

## Executive Summary

Adding multi-account support to email-mcp is a pure refactoring milestone: no new runtime dependencies, no protocol changes, and no architectural reinvention. The four existing libraries (imapflow, nodemailer, zod, @modelcontextprotocol/sdk) fully support the 1–3 account requirement. The work is entirely structural — centralizing config loading into a new `src/accounts.ts` module, replacing direct `process.env` reads in `imap.ts` and `smtp.ts` with an explicit `AccountConfig` parameter, and adding an optional `account` param to each of the 8 existing tools.

The recommended approach is to build a strict, non-ambiguous account resolution layer: case-insensitive exact label matching, 1-indexed numeric lookup, and clear error messages that list valid accounts when resolution fails. Partial matching, silent fallbacks, and cross-account defaults are explicitly ruled out. Backward compatibility for existing single-account deployments is handled entirely within `accounts.ts` via a legacy env var fallback (`ACCOUNT_1_EMAIL ?? EMAIL_ADDRESS`), making the upgrade transparent to current users.

The primary risks are subtle cross-account contamination bugs rather than architectural complexity. The two highest-risk failure modes are (1) any `process.env` read surviving in `imap.ts` or `smtp.ts` after the refactor — which causes silent wrong-account operations — and (2) the `from` address in `sendEmail` and the `appendToMailbox` IMAP call in `smtp.ts` being missed during the refactor, causing emails to send with the wrong identity and save to the wrong Sent folder. Both risks are eliminated by a post-refactor `process.env` audit across all `src/` files.

---

## Key Findings

### Recommended Stack

No dependency changes are required. All four runtime libraries handle multiple accounts natively through independent per-call instances. One package.json correction is needed: imapflow's spec (`^1.0.172`) is stale relative to the installed version (1.2.8) and should be updated. This is a documentation fix, not a functional change, since 1.2.8 is already installed and tested.

**Core technologies:**

- **imapflow 1.2.8** — IMAP client — each `new ImapFlow(config)` is fully independent; the per-request create/destroy pattern scales directly to multiple accounts without modification
- **nodemailer 6.10.1** — SMTP client — `createTransport(options)` is stateless per call; separate transporters per account require no additional configuration
- **zod 3.24.2** — schema validation — the `account` param is a standard `z.union([z.string(), z.number()]).optional()` field; no new zod capability needed
- **@modelcontextprotocol/sdk 1.12.1** — MCP protocol — no changes; `account` is just another optional tool parameter

### Expected Features

**Must have (table stakes):**

- `account` parameter on all 8 tools — every action must be attributable to a specific account
- Default to account 1 when param is omitted — existing single-account usage requires zero changes
- Case-insensitive exact label matching — "Personal" and "personal" must resolve identically
- Numeric account reference (1, 2, 3) — required per PROJECT.md spec
- Clear error when account not found, always listing valid labels — LLM caller must be able to self-correct
- Startup failure on partial account config — partial env vars must never silently produce a misconfigured account
- `send_email` uses the correct `from` address for the selected account
- IMAP connections scoped to the correct account — `list_emails(account="pro")` must not hit account 1's server
- Sent-folder save uses the sending account's IMAP config — not account 1's

**Should have (competitive):**

- `list_accounts` tool — explicit discovery of configured account labels and email addresses without reading env vars (low complexity, deferred from MVP but high value)

**Defer (v2+):**

- Dynamic tool descriptions mentioning configured account labels — MCP SDK does not support dynamic descriptions at registration time; not worth working around
- Partial/fuzzy label matching — unpredictable for an API; exact match is correct
- Per-account SENT_FOLDER override — not in scope for this milestone
- Cross-account search in a single call — adds response schema complexity, out of scope
- Runtime account add/remove — config-time only per PROJECT.md

### Architecture Approach

The architecture introduces exactly one new file — `src/accounts.ts` — and surgically modifies the three existing source files. All `process.env` access is centralized in `accounts.ts`, which loads and validates account configs at startup. The domain modules (`imap.ts`, `smtp.ts`) become pure functions of their `AccountConfig` parameter. `index.ts` loads accounts once at startup and resolves the `account` param to an `AccountConfig` before forwarding to domain functions. The existing per-request connection pattern (create → operate → destroy in finally) is retained unchanged.

**Major components:**

1. `src/accounts.ts` (NEW) — `AccountConfig` type, `SecurityMode` type, `loadAccounts()` startup function, `resolveAccount()` per-request resolution
2. `src/imap.ts` (MODIFIED) — all exported functions gain `account: AccountConfig` as final parameter; `getImapConfig()` replaced with `buildImapOptions(account)`
3. `src/smtp.ts` (MODIFIED) — `sendEmail()` gains `account: AccountConfig`; `from` address reads from `account.emailAddress`; `appendToMailbox` call passes `account` through
4. `src/index.ts` (MODIFIED) — startup validation replaced by `loadAccounts()`; all 8 tool handlers add `account` Zod param and `resolveAccount` call
5. `manifest.json` (MODIFIED) — `account_1_label` field added; `account_2_*` and `account_3_*` groups added as optional fields

### Critical Pitfalls

1. **Surviving `process.env` reads in imap.ts or smtp.ts** — grep `src/` for `process.env` after refactor; any occurrence outside `accounts.ts` startup block is a bug causing silent cross-account reads/sends
2. **`sendEmail` `from` address not updated** — `smtp.ts` line 63 reads `process.env["EMAIL_ADDRESS"]` directly, outside `getSmtpConfig()`; this specific line must be replaced with `account.emailAddress` or it sends from account 1's address regardless of which account was selected
3. **`appendToMailbox` in smtp.ts missing account param** — the IMAP call inside `sendEmail` must pass the same `AccountConfig`; omitting this saves sent mail to account 1's Sent folder even when sending from account 2 with no error
4. **Backward-compat env var fallback broken** — startup validation must check the resolved value (`ACCOUNT_1_EMAIL ?? EMAIL_ADDRESS`), not the raw indexed var; checking only `ACCOUNT_1_EMAIL` breaks all existing deployments immediately
5. **Empty string from Claude Desktop for unfilled optional fields** — Claude Desktop injects `""` for unfilled optional user_config fields; account-presence detection must use `host.trim().length > 0`, not `!!host` or `?? default`, because empty string is falsy but `??` treats it as a value

---

## Implications for Roadmap

Based on research, the build order is strictly constrained by type dependencies: `accounts.ts` must exist before `imap.ts` and `smtp.ts` can be modified, which must be complete before `index.ts` can be updated. Suggested phase structure:

### Phase 1: Account Config Foundation

**Rationale:** Everything else depends on `AccountConfig` type and the loading/resolution functions. This is the only dependency-free phase and must come first.

**Delivers:** `src/accounts.ts` with `AccountConfig` type, `SecurityMode` type, `loadAccounts()` (with legacy fallback), `resolveAccount()` (case-insensitive, index, and error-with-list behaviors).

**Addresses:** Table-stakes features — account registry, backward compat, error messages listing valid accounts.

**Avoids:** Pitfall 3 (backward-compat break), Pitfall 7 (empty string detection), Pitfall 8 (loose TypeScript types).

**Research flag:** Standard patterns — no deeper research needed. Direct code analysis already defines the exact function signatures and type shape.

### Phase 2: Domain Layer Refactor (imap.ts + smtp.ts)

**Rationale:** Both files can be modified in parallel after Phase 1. Neither has an ordering dependency on the other. Must complete before index.ts can be updated.

**Delivers:** `imap.ts` and `smtp.ts` with all exported functions accepting `AccountConfig`; `process.env` reads eliminated from both files; `appendToMailbox` passing `account` through.

**Addresses:** Correct IMAP scoping per account, correct `from` address in sent email, correct Sent folder for each account.

**Avoids:** Pitfall 1 (global env reads), Pitfall 2 (connection state shared across accounts), Pitfall 4 (`from` address bug), Pitfall 5 (`appendToMailbox` wrong account), Pitfall 11 (nodemailer transporter scoping).

**Research flag:** Standard patterns — all changes are mechanical parameter-threading with well-defined signatures from ARCHITECTURE.md.

### Phase 3: Tool Layer + Manifest

**Rationale:** Wires the account system into the MCP protocol layer once domain functions are account-aware. Manifest changes are independent of TypeScript changes and can be done in parallel with Phase 2 or 3.

**Delivers:** `index.ts` with `loadAccounts()` replacing startup validation, `account` optional Zod param on all 8 tools, `resolveAccount` call in each handler. `manifest.json` updated with account_1_label, account_2_*, account_3_* fields (all optional for accounts 2–3).

**Addresses:** All table-stakes features visible to MCP callers; UID namespace issue (Pitfall 10) addressed by including `account` label in all UID-bearing responses.

**Avoids:** Pitfall 6 (manifest form explosion — mark account 2/3 fields optional, omit rarely-used optional fields), Pitfall 9 (case-sensitive labels — normalize in resolver).

**Research flag:** Standard patterns — tool parameter additions follow existing Zod schema conventions exactly.

### Phase 4: Verification

**Rationale:** High-risk cross-account contamination bugs (Pitfalls 1–5) require explicit integration tests, not just type checking. Three test scenarios cover the main failure modes.

**Delivers:** Test coverage for (a) legacy single-account env vars still work, (b) account label resolution case-insensitive, (c) `send_email` from account 2 uses account 2's `from` address and saves to account 2's Sent folder, (d) empty-string optional env vars do not trigger account 2 initialization.

**Avoids:** All critical pitfalls — this phase is the detection layer for any that slipped through.

**Research flag:** Standard patterns — test scenarios are directly specified in PITFALLS.md detection sections.

### Phase Ordering Rationale

- Phases 1 → 2 → 3 → 4 is the strict dependency order from ARCHITECTURE.md build-order section
- Phase 2 (imap.ts and smtp.ts) can be developed in parallel — no ordering between them
- Manifest changes (Phase 3 item) are TypeScript-independent and can overlap with Phase 2
- The `list_accounts` tool (deferred from must-have) fits naturally in Phase 3 if scope allows; otherwise v2

### Research Flags

Phases with standard patterns (no deeper research needed):
- **All phases:** Research is complete and highly specific. ARCHITECTURE.md provides exact function signatures, PITFALLS.md provides exact line numbers and detection commands, FEATURES.md provides the exact account resolution spec. No phase requires additional research before implementation.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against installed `node_modules` source, package-lock.json, and live type definitions |
| Features | HIGH | Table stakes and anti-features drawn from stable multi-account email client conventions; account resolution spec is unambiguous |
| Architecture | HIGH | Derived from direct source analysis of all three `src/` files; no speculative patterns |
| Pitfalls | HIGH | All 13 pitfalls identified from direct code inspection with specific file/line references; no general patterns included |

**Overall confidence:** HIGH

### Gaps to Address

- **`list_accounts` tool scope decision:** Research recommends deferring to v2, but it is genuinely low-complexity. The roadmapper should make the explicit call on whether it fits Phase 3. There is no research gap — the gap is prioritization.
- **imapflow package.json spec update:** `^1.0.172` should be corrected to `^1.2.8` as a housekeeping item. This is not blocking but should not be forgotten.
- **Connection pooling pre-existing concern:** PITFALLS.md notes that per-request connection creation (one per tool call) is a pre-existing issue flagged in CONCERNS.md. This milestone does not worsen it, but if connection pooling is ever added, it must be keyed per account label. This is explicitly out of scope here.

---

## Sources

### Primary (HIGH confidence)

- `/Users/paul/Dev/email-mcp/node_modules/imapflow/lib/imap-flow.d.ts` — ImapFlowOptions type definition
- `/Users/paul/Dev/email-mcp/node_modules/imapflow/CHANGELOG.md` — version history to 1.2.8
- `/Users/paul/Dev/email-mcp/node_modules/nodemailer/lib/smtp-pool/index.js` — SMTP pool behavior
- `/Users/paul/Dev/email-mcp/package-lock.json` — installed versions
- `/Users/paul/Dev/email-mcp/src/index.ts`, `src/imap.ts`, `src/smtp.ts` — current implementation (direct analysis)
- `/Users/paul/Dev/email-mcp/manifest.json` — current user_config fields
- `/Users/paul/Dev/email-mcp/.planning/PROJECT.md` — requirements and constraints
- `/Users/paul/Dev/email-mcp/.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md` — codebase analysis

### Secondary (MEDIUM confidence)

- Training knowledge: Gmail multi-account UX, Apple Mail, Outlook, Spark email client conventions — informed anti-feature list and account resolution spec
- Training knowledge: Gmail API `userId` parameter pattern — confirmed per-operation account scoping is the correct design

---

*Research completed: 2026-03-28*
*Ready for roadmap: yes*
