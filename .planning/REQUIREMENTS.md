# Requirements: email-mcp Multi-Account Support

**Defined:** 2026-03-28
**Core Value:** Claude can read, search, and send email across multiple accounts without switching MCP instances — just specify the account label.

## v1 Requirements

### Account Configuration

- [ ] **CONF-01**: User can configure up to 3 accounts via indexed env vars (`ACCOUNT_1_*`, `ACCOUNT_2_*`, `ACCOUNT_3_*`)
- [ ] **CONF-02**: Each account has a label field — defaults to "account1/2/3" if omitted
- [ ] **CONF-03**: Accounts 2 and 3 are optional — server starts with just account 1
- [ ] **CONF-04**: Existing single-account env vars (`EMAIL_ADDRESS`, `IMAP_HOST`, etc.) continue working as account 1 (backward compat)

### Account Routing

- [ ] **ROUT-01**: All 8 tools accept an optional `account` parameter (label string or number 1–3)
- [ ] **ROUT-02**: When `account` is omitted, tools default to account 1
- [ ] **ROUT-03**: Account resolution is case-insensitive exact match on label
- [ ] **ROUT-04**: Unknown `account` value returns an error listing valid account labels
- [ ] **ROUT-05**: Tool responses include the account label so Claude can track which account owns a UID

### Manifest / Config Surface

- [ ] **MFST-01**: `manifest.json` `user_config` updated with optional account 2 and 3 fields
- [ ] **MFST-02**: `mcp_config.env` updated to document indexed env var names

## v2 Requirements

### Extended Account Support

- **EXT-01**: `list_accounts` tool to enumerate configured accounts and labels
- **EXT-02**: Per-account `SENT_FOLDER` override

## Out of Scope

| Feature | Reason |
|---------|--------|
| More than 3 accounts | Complexity grows nonlinearly; covers personal/pro/consultancy use case |
| Runtime account management (add/remove) | Config-time only; runtime changes add significant lifecycle complexity |
| Partial/fuzzy label matching | Silent wrong-account sends are a data integrity failure |
| Silent fallback to account 1 on unknown account | Every email client errors on unknown accounts; silent rerouting is a footgun |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 1 | Pending |
| CONF-02 | Phase 1 | Pending |
| CONF-03 | Phase 1 | Pending |
| CONF-04 | Phase 1 | Pending |
| ROUT-01 | Phase 2 | Pending |
| ROUT-02 | Phase 2 | Pending |
| ROUT-03 | Phase 2 | Pending |
| ROUT-04 | Phase 2 | Pending |
| ROUT-05 | Phase 2 | Pending |
| MFST-01 | Phase 2 | Pending |
| MFST-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 — traceability populated after roadmap creation*
