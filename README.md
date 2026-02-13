# email-mcp

A Claude Desktop Extension for email via IMAP and SMTP. One-click install, works with any email provider.

## Install

Download the `.mcpb` file and double-click it, or drag it into Claude Desktop. You'll be prompted to enter your email credentials through a secure settings UI.

## Features

- **Read** — browse your inbox with pagination, fetch full message content
- **Search** — find emails by sender, recipient, subject, body, date range, or read/unread status
- **Send** — compose and send emails with CC, BCC, reply-to, and HTML support
- **Manage** — move emails between folders (archive, trash, junk) or permanently delete
- **Folder discovery** — auto-detect available mailboxes for any IMAP provider

## Configuration

On install, Claude Desktop will prompt you for:

| Setting | Required | Description |
|---------|----------|-------------|
| Email Address | Yes | Your email address |
| Password / App Password | Yes | Your password or app password (stored encrypted) |
| IMAP Host | Yes | IMAP server hostname |
| SMTP Host | Yes | SMTP server hostname |
| IMAP Security | No | `ssl` (default), `starttls`, or `none` |
| SMTP Security | No | `ssl` (default), `starttls`, or `none` |
| IMAP/SMTP Port | No | Custom port (auto-detected from security mode) |
| Username | No | If different from email address |

### Common Provider Settings

**Gmail** (requires [App Password](https://myaccount.google.com/apppasswords)):
- IMAP Host: `imap.gmail.com`
- SMTP Host: `smtp.gmail.com`

**Outlook / Office 365**:
- IMAP Host: `outlook.office365.com`
- SMTP Host: `smtp.office365.com`
- SMTP Security: `starttls`

**Fastmail**:
- IMAP Host: `imap.fastmail.com`
- SMTP Host: `smtp.fastmail.com`

## Tools

| Tool | Description |
|------|-------------|
| `list_mailboxes` | List available folders |
| `list_emails` | List emails with pagination (newest first) |
| `fetch_email` | Get full email by UID (body + attachments) |
| `search_emails` | Search by sender, subject, date, body, read status |
| `send_email` | Send an email via SMTP |
| `move_email` | Move email to another folder |
| `delete_email` | Permanently delete an email |

## Development

```bash
npm install
npm run build          # Build server to server/
npm run build:mcpb     # Build + package as .mcpb
```

### Building the .mcpb

```bash
npm install -g @anthropic-ai/mcpb
npm run build:mcpb
```

This produces an `email-mcp.mcpb` file ready for distribution.

## Publishing

### Anthropic Extensions Directory
Submit for review to appear in Claude Desktop's built-in extensions browser. See the [Local MCP Server Submission Guide](https://support.claude.com/en/articles/12922832-local-mcp-server-submission-guide).

### Direct Distribution
Share the `.mcpb` file — users double-click to install.

## License

MIT
