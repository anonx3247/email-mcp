# Technology Stack

**Analysis Date:** 2026-03-27

## Languages

**Primary:**
- TypeScript 5.8.3 - Server implementation in `src/` directory

**Secondary:**
- JavaScript (ESM) - Compiled output for Node.js runtime

## Runtime

**Environment:**
- Node.js 22+ (target specified in `tsup.config.ts`)

**Package Manager:**
- npm
- Lockfile: present (package-lock.json assumed)

## Frameworks

**Core:**
- Model Context Protocol (MCP) SDK `@modelcontextprotocol/sdk` 1.12.1 - Protocol server and stdio transport for LLM integration
- imapflow 1.0.172 - IMAP client for email retrieval, search, and mailbox operations
- nodemailer 6.10.1 - SMTP client for sending emails

**Validation:**
- zod 3.24.2 - Schema validation and type-safe tool parameter definitions

**Build:**
- tsup 8.4.0 - TypeScript bundler that compiles `src/index.ts` to ESM in `server/` directory
- TypeScript 5.8.3 - Language and type checking

**Development:**
- @typescript-eslint/eslint-plugin 8.32.1 - TypeScript linting rules
- @typescript-eslint/parser 8.32.1 - TypeScript AST parser for ESLint
- eslint 9.27.0 - Code linting
- @types/nodemailer 6.4.17 - Type definitions for nodemailer
- @types/node - Node.js type definitions

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` 1.12.1 - Implements MCP protocol server with stdio transport; required for Claude integration
- `imapflow` 1.0.172 - IMAP protocol implementation with TLS/STARTTLS support; handles all email reading operations
- `nodemailer` 6.10.1 - SMTP protocol client; handles email sending with support for HTML, attachments via MailComposer

**Infrastructure:**
- `zod` 3.24.2 - Runtime validation of MCP tool parameters; ensures type safety for all tool definitions

## Configuration

**Environment:**
Configuration via environment variables (all optional except where noted):

**Email Authentication:**
- `EMAIL_ADDRESS` (required) - Email address for authentication and sending
- `EMAIL_USERNAME` (default: EMAIL_ADDRESS) - IMAP/SMTP username if different
- `EMAIL_PASSWORD` (required unless IMAP_SECURITY/SMTP_SECURITY = "none") - Password for authentication

**IMAP Server:**
- `IMAP_HOST` (required) - IMAP server hostname
- `IMAP_PORT` (default: 993 if ssl, 143 if other) - IMAP port
- `IMAP_SECURITY` (default: "ssl") - "ssl", "starttls", or "none"

**SMTP Server:**
- `SMTP_HOST` (required) - SMTP server hostname
- `SMTP_PORT` (default: 465 if ssl, 587 if starttls, 25 if none) - SMTP port
- `SMTP_SECURITY` (default: "ssl") - "ssl", "starttls", or "none"

**TLS Options:**
- `SSL_VERIFY` (default: true) - Verify TLS certificates via rejectUnauthorized

**Mailbox Options:**
- `SENT_FOLDER` (default: "Sent") - Mailbox path where sent emails are saved after SMTP send

**Build:**
- tsup configuration in `tsup.config.ts` specifies:
  - Entry point: `src/index.ts`
  - Format: ESM only
  - Target: Node 22+
  - Output directory: `server/`
  - Shebang added for CLI executable
  - Source maps and .d.ts declaration files generated

## Platform Requirements

**Development:**
- Node.js 22+
- npm or compatible package manager
- TypeScript knowledge recommended for contribution

**Production:**
- Node.js 22+ runtime
- Network access to IMAP and SMTP servers
- Deployment as CLI tool or embedded MCP server via stdio transport
- Designed for integration with Claude or other LLM clients via Model Context Protocol

---

*Stack analysis: 2026-03-27*
