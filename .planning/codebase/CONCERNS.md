# Codebase Concerns

**Analysis Date:** 2026-03-27

## Tech Debt

**Connection Resource Leaks in IMAP Operations:**
- Issue: Each IMAP function (`listMailboxes`, `listEmails`, `fetchEmail`, `searchEmails`, `moveEmail`, `deleteEmail`, `markEmail`) creates a new `ImapFlow` client for every invocation. These clients are not reused and connection state isn't pooled.
- Files: `src/imap.ts` (lines 49-51, 76-88, 90-105, 134-175, 250-328, 340-376, 385-418, 420-435, 437-457)
- Impact: In high-frequency usage, creates excessive connection overhead. Each tool call establishes and tears down a fresh TCP connection, reducing throughput and increasing latency. Concurrent requests from the same Claude session will create multiple independent connections.
- Fix approach: Implement a connection pool or singleton client pattern. Store a persistent `ImapFlow` instance that's reused across calls, with proper reconnection logic for transient failures.

**Silent Logout Failures:**
- Issue: All IMAP logout operations use `.catch(() => {})` to silently swallow errors (lines 86, 103, 173, 326, 374, 416, 433, 455 in `src/imap.ts`).
- Files: `src/imap.ts` (lines 86, 103, 173, 326, 374, 416, 433, 455)
- Impact: Connection cleanup failures go unnoticed. Dead connections accumulate on the server, potentially hitting connection limits. Transient network issues during logout hide underlying problems.
- Fix approach: Log logout errors at debug/warn level instead of silently suppressing. Only catch expected errors; let unexpected ones surface.

**Large Email Body Buffer Accumulation:**
- Issue: Email bodies and full message sources are downloaded entirely into memory using `Buffer.concat()` pattern (lines 282-286, 291-295, 301-305 in `src/imap.ts`). No size limits or streaming for large attachments.
- Files: `src/imap.ts` (lines 250-328, specifically 282-286, 291-295, 301-305)
- Impact: Fetching very large emails (10MB+) can consume significant heap memory. No protection against maliciously large emails or attachments. Could cause OOM crashes under heavy load.
- Fix approach: Implement size limits before downloading. Stream content to disk for large bodies or implement chunked processing with memory limits.

**Unvalidated Email Addresses in Tool Parameters:**
- Issue: `send_email`, `move_email`, `list_emails`, `fetch_email`, `delete_email`, and `mark_email` tools accept mailbox names and email addresses without validation beyond basic type checking via Zod schemas.
- Files: `src/index.ts` (lines 49-251)
- Impact: Invalid or specially-crafted mailbox names could trigger unexpected behavior in IMAP/SMTP clients. Email injection attacks possible if LLM generates malformed "to" addresses.
- Fix approach: Add email format validation (RFC 5322 subset) for recipient addresses. Validate mailbox names against IMAP naming conventions (allow alphanumeric, dots, dashes, underscores).

**No Timeout Configuration:**
- Issue: IMAP client connects without explicit timeout settings. `client.connect()` and operations can hang indefinitely if server becomes unresponsive.
- Files: `src/imap.ts` (lines 14-46, 49-51)
- Impact: Tool calls can hang forever, blocking the MCP server from processing other requests. Long-running operations leave connections open consuming resources.
- Fix approach: Set `idleTimeout`, `connectionTimeout`, and per-operation timeouts in `ImapFlowOptions`.

## Known Bugs

**Email Body Fallback Logic Incomplete:**
- Symptoms: Emails with complex MIME structures may not have their text body extracted correctly. Lines 299-310 in `src/imap.ts` have a fallback that downloads the entire message when no text/plain or text/html part is found, but this heuristic doesn't handle multipart/alternative correctly.
- Files: `src/imap.ts` (lines 299-311)
- Trigger: Send an email with Content-Type: `multipart/related` or `multipart/mixed` without explicit text/plain or text/html parts. The fallback will dump the entire raw MIME structure.
- Workaround: Implement proper MIME tree traversal to find the best text representation in multipart structures.

**Search Result Ordering Edge Case:**
- Symptoms: `searchEmails` returns results sorted by UID descending after slicing, but older searches with gaps in UID sequences may return unexpected order.
- Files: `src/imap.ts` (lines 340-376, specifically 362-370)
- Trigger: Search that returns non-contiguous UIDs (e.g., [1, 5, 10, 20]) will be sorted descending but the `slice(-limit)` happens before sort, meaning oldest results are still trimmed.
- Workaround: Sort before slicing to ensure most recent `limit` results are returned consistently.

## Security Considerations

**Plaintext Password Handling:**
- Risk: Email passwords are stored in environment variables and passed to IMAP/SMTP clients without explicit masking in logs. If process crashes, error output might include connection config.
- Files: `src/index.ts` (lines 8, 13), `src/imap.ts` (lines 14-46), `src/smtp.ts` (lines 9-39)
- Current mitigation: CLAUDE.md notes credentials are "stored encrypted" by Claude Desktop. Manifest marks `email_password` as `"sensitive": true`. Code doesn't log full config objects.
- Recommendations: Add explicit password redaction in any error messages. Avoid logging the full `getSmtpConfig()` or `getImapConfig()` objects. Consider using `process.env` only at startup and clearing sensitive variables after config is extracted.

**Unauthenticated "none" Security Mode:**
- Risk: IMAP_SECURITY or SMTP_SECURITY set to "none" allows unencrypted connections. Credentials transmitted in plaintext over network.
- Files: `src/imap.ts` (lines 18-43), `src/smtp.ts` (lines 13-36), `src/index.ts` (lines 27-34)
- Current mitigation: Defaults to "ssl". Warns in startup logs if "none" is used.
- Recommendations: Emit a clear security warning when "none" mode is detected. Consider requiring explicit override (env var or prompt). Document the security implications in README.

**TLS Certificate Verification Bypass:**
- Risk: `SSL_VERIFY` environment variable defaults to true but can be set to "false", disabling certificate verification. Vulnerable to MITM attacks.
- Files: `src/imap.ts` (line 22), `src/smtp.ts` (line 18)
- Current mitigation: None beyond default. Manifest mentions this setting but doesn't restrict it.
- Recommendations: Warn prominently when `SSL_VERIFY` is false. Log at error level when bypassing verification. Require explicit confirmation before allowing this in production environments.

**No Rate Limiting or Brute Force Protection:**
- Risk: No built-in protection against repeated failed authentication attempts. Attacker could brute force credentials if server is exposed.
- Files: `src/imap.ts` (lines 42-44), `src/smtp.ts` (lines 34-36)
- Current mitigation: Relies on server-side rate limiting (which varies by provider).
- Recommendations: Not applicable for single-user MCP server. Document that this is a single-user tool and should not be exposed over network.

## Performance Bottlenecks

**Synchronous String Parsing in `fetchEmail`:**
- Problem: Email body is loaded entirely into memory as a string via `Buffer.concat().toString("utf-8")` (lines 286, 295, 305 in `src/imap.ts`). For emails with very large bodies (100MB+), this blocks the event loop.
- Files: `src/imap.ts` (lines 282-305)
- Cause: Collecting all chunks in an array, then concatenating, then converting to UTF-8. No streaming or chunked processing.
- Improvement path: Implement streaming body handler. Use `Readable.from()` to create a stream from download, pipe through a Transform that buffers to a configurable size limit, or write to temporary file for large bodies.

**N+1 Connection Pattern:**
- Problem: `appendToMailbox()` creates a new client connection. Called from `sendEmail()` which already uses `nodemailer` (separate connection). Result: send operation creates 2+ independent connections.
- Files: `src/smtp.ts` (lines 88-123), `src/imap.ts` (lines 76-88)
- Cause: IMAP and SMTP clients are decoupled. Saving sent email to IMAP folder requires a separate IMAP connection.
- Improvement path: Either use IMAP APPEND within existing client context, or batch IMAP operations to reuse pooled connections.

**Inefficient List Pagination:**
- Problem: `listEmails` fetches UIDs and metadata for the requested range, but total count lookup happens first (line 143: `mb.exists`). For large mailboxes (100K+ emails), each page load opens/closes connection.
- Files: `src/imap.ts` (lines 134-175)
- Cause: No connection reuse; each call creates fresh client.
- Improvement path: With pooled connections, this becomes negligible.

## Fragile Areas

**Complex MIME Structure Traversal:**
- Files: `src/imap.ts` (lines 183-235, functions `collectAttachments`, `findPart`)
- Why fragile: Recursive tree walk on `MessageStructureObject` doesn't validate node types. If imapflow returns unexpected structure, could crash or skip content. Attachment detection relies on `disposition` and filename parameters which vary across providers.
- Safe modification: Add defensive checks: `if (!node.childNodes?.length) return` instead of relying on implicit undefined. Test against real-world emails from Gmail, Outlook, Fastmail with nested forwarded messages and mixed content.
- Test coverage: No tests exist for MIME parsing. Edge cases like multipart/signed, multipart/encrypted, message/rfc822 are untested.

**Error Message Forwarding in Tool Handlers:**
- Files: `src/index.ts` (lines 49-251, each tool's catch block)
- Why fragile: All tools catch errors and return `{ isError: true, content: [{ type: "text", text: msg }] }`. If an error message contains sensitive info (database errors, internal paths), it's exposed to Claude.
- Safe modification: Implement error classification. Log full errors internally; return sanitized messages to Claude (e.g., "Email fetch failed" instead of "connection reset by peer").
- Test coverage: No error scenarios are tested.

**Transient IMAP Connection Failures:**
- Files: `src/imap.ts` (lines 82-88, 92-105, etc. - try/finally blocks)
- Why fragile: If `client.connect()` succeeds but `client.logout()` fails, or intermediate operation fails partway through, finally block still calls logout on potentially-dead connection. Cascading errors swallowed.
- Safe modification: Track connection state explicitly. Only call logout if connected. Retry failed connections with exponential backoff.
- Test coverage: Network simulation (packet loss, latency, disconnects) not tested.

## Scaling Limits

**Per-Instance Connection Limits:**
- Current capacity: IMAP server typically allows 5-10 concurrent connections per account. Each tool call creates 1 new connection.
- Limit: With connection pooling, can theoretically handle unlimited concurrent tool calls up to IMAP server limits. Without pooling, hitting server limits at ~5-10 simultaneous requests.
- Scaling path: Implement connection pool with queue. Defaults to 3-5 pooled connections, configurable via env var `IMAP_POOL_SIZE`.

**Email Size Memory Constraints:**
- Current capacity: Available heap memory (typically 512MB-2GB in Node.js). Unbounded Buffer.concat for email bodies.
- Limit: Single 50MB email can consume that much heap. Concurrent requests multiply the problem.
- Scaling path: Implement configurable max body size (default 10MB). Stream larger bodies to disk with path returned to Claude instead of full content.

**Search Result Limits:**
- Current capacity: No limit on search result size. Searching for "a" in a mailbox with 100K emails returns all 100K UIDs, fetches all.
- Limit: `limit` parameter caps to 200, but search query itself has no server-side limits.
- Scaling path: Add server-side cursor-based pagination for search. Use IMAP SEARCH with limits enforced by imapflow.

## Dependencies at Risk

**imapflow 1.0.172:**
- Risk: Library is actively maintained but IMAP protocol is complex. Newer versions may introduce breaking changes in connection handling or error behavior.
- Impact: Future updates could require rewriting connection/error handling code.
- Migration plan: Keep pinned to 1.0.x. Test against major releases before upgrading. Monitor GitHub releases for security patches.

**nodemailer 6.10.1:**
- Risk: Large ecosystem dependency. Transitive dependencies could introduce vulnerabilities. SMTP protocol evolution may require updates.
- Impact: Email sending could break with provider changes (e.g., OAuth2 required instead of passwords).
- Migration plan: Monitor for security advisories. Consider adding OAuth2 support separately when needed.

**@modelcontextprotocol/sdk 1.12.1:**
- Risk: New MCP protocol versions may introduce incompatibilities. SDK is rapidly evolving.
- Impact: Manifest format or tool schema changes could require code refactoring.
- Migration plan: Test against SDK patch/minor releases quarterly. Don't auto-update; manually test before deploying.

## Missing Critical Features

**No Email Composition Draft Support:**
- Problem: Can only send emails, not save drafts. If Claude generates a long reply, there's no way to stage it for manual review before sending.
- Blocks: Workflows requiring review/approval before send.

**No Message Threading:**
- Problem: Emails are returned as individual messages. No conversation grouping by In-Reply-To or References headers.
- Blocks: High-context tasks that need to see full conversation history in order.

**No Attachment Handling:**
- Problem: Attachments are listed (name, size, MIME type) but can't be downloaded or sent. `fetch_email` returns attachment metadata only.
- Blocks: Workflows requiring attachment processing (extracting files, re-sending with new attachments).

**No Multi-Account Support:**
- Problem: Single email account per MCP instance. Different accounts require separate MCP servers.
- Blocks: Tasks requiring cross-account operations or consolidated inbox views.

**No Folder Subscription/Visibility:**
- Problem: `list_mailboxes` returns all folders including system folders. No way to hide or organize folder list for user preferences.
- Blocks: Workflows with large folder hierarchies becoming unwieldy.

## Test Coverage Gaps

**IMAP Connection Error Scenarios:**
- What's not tested: Network timeouts, server disconnects mid-operation, authentication failures, TLS errors, rate limiting.
- Files: `src/imap.ts` (all functions), `src/index.ts` (tool handlers)
- Risk: Connection errors currently crash with generic messages or hang. No graceful degradation.
- Priority: High

**MIME Structure Edge Cases:**
- What's not tested: Nested multipart, alternative parts, signed/encrypted, message/rfc822 embedded messages, malformed structure.
- Files: `src/imap.ts` (lines 183-235, 270-310)
- Risk: Rare email formats cause crashes or silent data loss.
- Priority: High

**Search with Complex Criteria:**
- What's not tested: Combining multiple search criteria (from + since + body), invalid date formats, special characters in search strings, empty result sets.
- Files: `src/imap.ts` (lines 340-376), `src/index.ts` (lines 113-148)
- Risk: Unexpected search results or crashes with edge-case criteria.
- Priority: Medium

**Email Sending with Large Recipients:**
- What's not tested: CC/BCC with 100+ recipients, very long subject lines, extremely large HTML bodies, special characters in recipient names.
- Files: `src/smtp.ts` (lines 56-123), `src/index.ts` (lines 150-189)
- Risk: Rejections from SMTP servers or malformed headers.
- Priority: Medium

**Move/Delete Operations:**
- What's not tested: Moving to non-existent folders, deleting from system folders, race conditions with concurrent moves, expunge behavior.
- Files: `src/imap.ts` (lines 385-435), `src/index.ts` (lines 191-251)
- Risk: Silent failures or data loss.
- Priority: High

---

*Concerns audit: 2026-03-27*
