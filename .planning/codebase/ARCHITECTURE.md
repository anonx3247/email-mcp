# Architecture

**Analysis Date:** 2026-03-27

## Pattern Overview

**Overall:** Modular MCP (Model Context Protocol) Server with separate protocol communication and domain logic layers.

**Key Characteristics:**
- Single-process Node.js server using stdio transport for MCP communication
- Stateless, request-response architecture with per-request client connections
- Clear separation between protocol layer (MCP tool handlers) and domain logic (IMAP/SMTP)
- ESM modules with strict TypeScript for type safety
- Environment-based configuration (no config files)

## Layers

**Protocol Layer (MCP Server):**
- Purpose: Accept tool invocations from MCP client, validate inputs with Zod, return formatted responses
- Location: `src/index.ts`
- Contains: MCP server initialization, tool registration with Zod schemas, error handling wrappers
- Depends on: `@modelcontextprotocol/sdk`, `zod`, IMAP and SMTP modules
- Used by: MCP client (Claude Desktop or similar)

**IMAP Domain Layer:**
- Purpose: Encapsulate all IMAP operations (connect, authenticate, read, search, move, delete emails)
- Location: `src/imap.ts`
- Contains: ImapFlow client initialization, mailbox operations, email fetching/searching, message parsing
- Depends on: `imapflow` (IMAP protocol library)
- Used by: Protocol layer for email read/search/management operations

**SMTP Domain Layer:**
- Purpose: Encapsulate all SMTP operations (send emails, save to sent folder)
- Location: `src/smtp.ts`
- Contains: Nodemailer transporter initialization, email composition, SMTP sending, sent folder backup
- Depends on: `nodemailer` (SMTP client), IMAP module for sent folder persistence
- Used by: Protocol layer for email sending operations

**Configuration Layer:**
- Purpose: Centralize credential and server configuration from environment variables
- Location: `src/imap.ts` (getImapConfig), `src/smtp.ts` (getSmtpConfig)
- Contains: Config builders with security mode resolution, port defaults, TLS options
- Depends on: process.env
- Used by: Domain layers for establishing connections

## Data Flow

**Read Email Flow:**

1. MCP client invokes `list_emails` or `fetch_email` tool with mailbox and page parameters
2. Protocol layer validates input with Zod schema
3. Protocol layer calls IMAP domain function
4. IMAP module creates ImapFlow client with getImapConfig()
5. ImapFlow connects to IMAP server, authenticates
6. IMAP module fetches message metadata or full message content
7. IMAP module parses envelope, body parts, attachments, formats response
8. Protocol layer wraps result in MCP response format
9. Response sent to MCP client as JSON text

**Send Email Flow:**

1. MCP client invokes `send_email` tool with to, subject, body, and optional cc/bcc/replyTo
2. Protocol layer validates input with Zod schema
3. Protocol layer calls SMTP sendEmail function
4. SMTP module creates Nodemailer transporter with getSmtpConfig()
5. Nodemailer connects to SMTP server, authenticates
6. Nodemailer sends email, returns messageId
7. SMTP module uses MailComposer to build RFC 2822 raw message with assigned messageId
8. SMTP module calls appendToMailbox (IMAP) to save raw message to Sent folder
9. Result includes messageId, accepted/rejected recipients, sent folder status
10. Protocol layer wraps result in MCP response format

**Search Email Flow:**

1. MCP client invokes `search_emails` with criteria (from, to, subject, date range, body, seen status)
2. Protocol layer validates input with Zod schema
3. Protocol layer calls IMAP searchEmails function
4. IMAP module creates ImapFlow client
5. IMAP module builds SearchObject from criteria
6. ImapFlow searches mailbox, returns matching UIDs
7. IMAP module fetches message metadata for matches
8. IMAP module formats summaries, sorts newest first
9. Protocol layer wraps results in MCP response format

**State Management:**
- No persistent state. Each tool invocation creates a new IMAP/SMTP client connection
- Configuration loaded from environment once at server startup
- Per-request context: each call gets isolated ImapFlow/Nodemailer instance
- Connections are cleaned up in finally blocks after each operation

## Key Abstractions

**ImapFlow Client:**
- Purpose: Abstract IMAP protocol details, provide connection pooling and command buffering
- Examples: `src/imap.ts` createClient(), getImapConfig()
- Pattern: Factory function creates new instance per request, automatic cleanup

**Nodemailer Transporter:**
- Purpose: Abstract SMTP protocol details, handle authentication and message delivery
- Examples: `src/smtp.ts` getSmtpConfig()
- Pattern: Created per sendEmail call, closed in finally block

**Message Envelope & Structure:**
- Purpose: Parse complex nested MIME structures, extract text/html bodies and attachments
- Examples: `src/imap.ts` collectAttachments(), findPart(), messageToSummary()
- Pattern: Tree walking over MessageStructureObject, recursive descent for nested parts

**Security Configuration:**
- Purpose: Support multiple TLS modes (ssl, starttls, none) with secure port defaults
- Examples: `src/imap.ts` getImapConfig(), `src/smtp.ts` getSmtpConfig()
- Pattern: SecurityMode type union, port defaults based on mode

## Entry Points

**Server Entry:**
- Location: `src/index.ts` (lines 253-262)
- Triggers: `npm run start` or node execution as CLI tool
- Responsibilities: Initialize McpServer, register all tools with Zod validation, create StdioServerTransport, connect and listen

**Tool Invocations:**
- Locations: `src/index.ts` server.tool() calls for each of 8 tools
- Triggers: MCP client JSON-RPC requests for tool execution
- Responsibilities: Validate parameters, call domain function, format response, handle errors

## Error Handling

**Strategy:** Try-catch with consistent error wrapping. All errors returned as MCP error responses with message text.

**Patterns:**
- Domain functions throw Error instances with descriptive messages
- Protocol layer catches errors in tool handlers and returns `{ isError: true, content: [{ type: "text", text: msg }] }`
- IMAP/SMTP clients always cleanup in finally blocks (logout, transporter.close())
- Missing messages return explicit error, invalid mailboxes throw from client library
- Sent folder save failures logged to stderr but don't fail the send operation (graceful degradation)

## Cross-Cutting Concerns

**Logging:**
- Startup: console.error() for connection configuration
- Errors: Caught and returned in MCP response format
- Sent folder failures: console.error() for debugging

**Validation:**
- Zod schemas on all tool inputs (mailbox names, UIDs, email addresses, page numbers)
- Environment validation at startup (EMAIL_ADDRESS, IMAP_HOST, SMTP_HOST required)
- Security mode enum validation (ssl | starttls | none)

**Authentication:**
- Environment variables (EMAIL_USERNAME defaults to EMAIL_ADDRESS, EMAIL_PASSWORD required except for no-security mode)
- TLS certificate verification controlled by SSL_VERIFY env var
- Credentials passed to ImapFlow/Nodemailer configs, never logged

---

*Architecture analysis: 2026-03-27*
