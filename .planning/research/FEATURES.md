# Feature Landscape

**Domain:** Multi-account email MCP server (1–3 named accounts)
**Researched:** 2026-03-28
**Confidence note:** Multi-account email UX is a stable, well-established domain. Patterns below are drawn from training knowledge of email clients (Gmail, Apple Mail, Outlook, Thunderbird, Spark, Airmail) and programmatic email APIs (Gmail API, Microsoft Graph, Fastmail JMAP). Confidence is HIGH for UX conventions; MEDIUM for specific error message wording preferences.

---

## Table Stakes

Features users expect when multi-account support exists. Missing any of these makes the feature feel half-baked.

| Feature | Why Expected | Complexity | Dependency |
|---------|--------------|------------|------------|
| `account` param on all 8 tools | Core contract: every action must be attributable to an account | Low — additive param | Requires account registry at startup |
| Default to account 1 when param omitted | Backward compat; single-account users should notice nothing | Low | Account registry |
| Case-insensitive label matching | Users type "Personal" not "personal"; every email client does this | Very low — `toLowerCase()` | Account registry lookup |
| Exact label match (full string) | Unambiguous lookup; "pro" should not match "pro-archive" | Low | Label normalization |
| Numeric account reference ("1", "2", "3") | Useful fallback when label is forgotten; users expect it from the PROJECT.md spec | Low | Account registry |
| Clear error when account not found | Silent fallback to account 1 when wrong label is given is a dangerous footgun for `send_email` | Very low | Error return path |
| Clear error when account not configured | `ACCOUNT_2_*` env vars are partial or missing; must not silently fall through | Low — startup validation | Startup config parse |
| List of configured accounts visible | User must be able to discover what accounts exist without reading env vars | Low — tool description or new tool | Account registry |
| `send_email` uses correct `from` address | Sending from account 2 must use account 2's EMAIL_ADDRESS, not account 1's | Low | Per-account config object |
| IMAP connections scoped to correct account | `list_emails(account="pro")` must not hit account 1's IMAP server | Low — pass config to client factory | Per-account config object |

---

## Differentiators

Features that are not universally expected but add clear value for this use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Partial label match as fallback | "consult" resolves to "consultancy" — friendlier for LLM callers that abbreviate | Low | Risky for `send_email`; see anti-features |
| Account summary in tool descriptions | Tool descriptions in the MCP schema mention configured accounts by label | Medium — dynamic schema generation | MCP SDK may not support dynamic tool descriptions easily |
| `list_accounts` tool | Explicit tool to return all configured account labels and email addresses | Very low | Nice-to-have; discovery without env inspection |

---

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Partial match for `send_email` | "pro" matching "pro-consultancy" sends from wrong account — silent data integrity failure | Require exact label (case-insensitive); return error listing valid labels |
| Silent fallback to account 1 on unknown label | Masks misconfiguration; dangerous for send operations | Return an explicit error with list of valid labels |
| Account resolution by email address substring | "gmail" matching "user@gmail.com" is clever but fragile; LLMs should use explicit labels | Accept label or index only |
| Cross-account operations in a single tool call | E.g., `search_emails` that queries all accounts at once — adds response schema complexity | Out of scope; user can call per account |
| Runtime account switching / add/remove | Requires dynamic config mutation and connection management overhead | Config-time only per PROJECT.md |
| Fuzzy/edit-distance label matching | "prsonal" resolving to "personal" introduces unpredictability | Case-insensitive exact match only |
| Per-account SENT_FOLDER override | Not in scope for this milestone | Add later if requested |

---

## Account Resolution Specification

This is the critical UX question for this milestone. Based on established multi-account email client conventions:

### Resolution Order

1. If `account` param is absent → use account 1 (no error)
2. If `account` is a digit string "1", "2", or "3" → look up by index (1-based); error if that account is not configured
3. If `account` is a string → case-insensitive exact match against configured labels; error if no match

### Case Sensitivity

Treat labels as case-insensitive for resolution. Store internally in lowercase. Accept "Personal", "PERSONAL", "personal" as equivalent. This is the universal convention across email clients and most APIs.

### Ambiguity Rule

No partial matching. The `account` field is an explicit selector, not a search query. If the user passes "per" and the label is "personal", return an error. This is the correct behavior for an API (as opposed to a GUI autocomplete). An LLM caller has the full label available from prior `list_accounts` or conversation context.

### Numeric Index Behavior

Accept integers 1–3 or string representations "1"–"3". Index 1 = first configured account. Error if index is in range (1–3) but that account is not configured (e.g., requesting account 2 when only account 1 is set up).

---

## Error Messages

Error messages are returned as MCP `isError: true` responses with text content. Based on the existing error pattern in `src/index.ts`.

| Scenario | Message | Rationale |
|----------|---------|-----------|
| Unknown label | `Account "foo" not found. Configured accounts: personal (1), pro (2)` | Lists valid options so LLM can self-correct without a follow-up call |
| Index out of range or not configured | `Account 3 is not configured. Configured accounts: personal (1), pro (2)` | Same pattern: show what exists |
| Account index out of bounds (< 1 or > 3) | `Account index must be between 1 and 3` | Hard constraint |
| Partial config (label set but IMAP_HOST missing) | Caught at startup, not at call time — server should fail to start if a partially-configured account is found | Fail fast at startup; don't surface mid-request |
| No accounts configured at all | Server fails to start — existing behavior already requires `IMAP_HOST`, `SMTP_HOST`, `EMAIL_ADDRESS` | Backward compat |

Key design choice: **errors should always list valid account labels** so the LLM caller can recover in the same session without user intervention.

---

## Feature Dependencies

```
Per-account config registry (parse all ACCOUNT_N_* env vars at startup)
  → Account resolver function (label/index → config object)
    → getImapConfig(account) — pass config instead of reading env vars
    → getSmtpConfig(account) — same
      → All 8 tool handlers (add optional `account` param, pass to domain functions)
        → Error messages listing valid accounts

Backward compat layer:
  → If ACCOUNT_1_EMAIL not set but EMAIL_ADDRESS is set → treat legacy single-account vars as account 1
```

---

## MVP Recommendation

Build exactly this, nothing more:

1. **Account registry** — parse `ACCOUNT_1_*` through `ACCOUNT_3_*` at startup; fall back to legacy `EMAIL_ADDRESS` / `IMAP_HOST` / `SMTP_HOST` for account 1 if indexed vars absent
2. **Account resolver** — case-insensitive exact label match + numeric index 1–3; returns config object or throws structured error
3. **Parameterized config factories** — `getImapConfig(accountConfig)` and `getSmtpConfig(accountConfig)` accept config object instead of reading `process.env` directly
4. **Optional `account` param on all 8 tools** — Zod: `z.union([z.string(), z.number().int().min(1).max(3)]).optional()`
5. **Error messages that list valid accounts** — error string always ends with "Configured accounts: label (N), ..."

Defer:
- `list_accounts` tool: useful but not blocking; users can discover accounts from the error message
- Dynamic tool descriptions mentioning configured accounts: MCP SDK does not support dynamic tool descriptions at registration time; not worth working around

---

## Sources

- Training knowledge: Gmail multi-account UX, Apple Mail, Outlook multi-account behavior, Spark email client
- Training knowledge: Gmail API `userId` parameter pattern (account-scoped operations)
- Training knowledge: Microsoft Graph API delegated permission scoping
- Codebase analysis: `/Users/paul/Dev/email-mcp/src/index.ts`, `src/imap.ts`, `src/smtp.ts`
- Project spec: `/Users/paul/Dev/email-mcp/.planning/PROJECT.md`
- Confidence: HIGH for table stakes and anti-features (stable domain conventions); MEDIUM for exact error message wording
