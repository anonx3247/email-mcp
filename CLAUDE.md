# CLAUDE.md

## Project Overview

**email-mcp** - A Node.js MCP (Model Context Protocol) server for email via IMAP and SMTP. Supports SSL/TLS and STARTTLS for both protocols using `imapflow` and `nodemailer`.

## Build Commands

```bash
npm install
npm run build        # Build with tsup
npm run dev          # Build in watch mode
npm run start        # Run built server
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

## Architecture

Single-process MCP server using stdio transport:

- **`src/index.ts`** - Entry point, MCP server setup, tool definitions
- **`src/imap.ts`** - IMAP client using `imapflow` (list, fetch, search emails)
- **`src/smtp.ts`** - SMTP client using `nodemailer` (send emails)

## Configuration

All configuration via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_ADDRESS` | Email address | required |
| `EMAIL_USERNAME` | Auth username | EMAIL_ADDRESS |
| `EMAIL_PASSWORD` | Auth password | required |
| `IMAP_HOST` | IMAP server hostname | required |
| `IMAP_PORT` | IMAP port | 993 |
| `IMAP_SECURITY` | `ssl`, `starttls`, or `none` | ssl |
| `SMTP_HOST` | SMTP server hostname | required |
| `SMTP_PORT` | SMTP port | 465 |
| `SMTP_SECURITY` | `ssl`, `starttls`, or `none` | ssl |
| `SSL_VERIFY` | Verify TLS certificates | true |

## TypeScript Conventions

- **Never use `any`** - always provide proper types
- **Use `??`** over `||` for nullish coalescing
- ESM modules (`"type": "module"`)
- Strict mode enabled

## MCP Tools

- `list_mailboxes` - List available mailboxes/folders
- `list_emails` - List emails in a mailbox with pagination
- `fetch_email` - Fetch a single email by UID
- `search_emails` - Search emails by criteria
- `send_email` - Send an email via SMTP
