# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Patterns

**Files:**
- `src/index.ts` - Entry point
- `src/imap.ts` - IMAP protocol operations
- `src/smtp.ts` - SMTP protocol operations
- Kebab-case is avoided; single word or compound names are used

**Functions:**
- camelCase for all functions: `sendEmail`, `listMailboxes`, `fetchEmail`, `searchEmails`, `moveEmail`, `deleteEmail`, `markEmail`
- Private helper functions use camelCase: `getImapConfig()`, `getSmtpConfig()`, `createClient()`, `formatAddress()`, `collectAttachments()`, `findPart()`, `messageToSummary()`
- Async functions explicitly return `Promise<T>`: `async function listEmails(): Promise<ListEmailsResult>`

**Variables:**
- camelCase for all variables: `emailAddress`, `imapHost`, `smtpHost`, `emailPassword`, `toStr`, `ccStr`, `bccStr`, `mailOptions`, `textBody`, `htmlBody`
- Config/constant values use camelCase: `sslVerify`, `defaultPort`, `sentFolder`
- Underscore prefix pattern: Parameters that are unused are prefixed with `_` (configured in ESLint rule `argsIgnorePattern: "^_"`)

**Types:**
- PascalCase for interfaces: `MailboxInfo`, `EmailSummary`, `ListEmailsResult`, `AttachmentInfo`, `FetchEmailResult`, `SearchCriteria`, `SendEmailOptions`, `SendEmailResult`, `MoveEmailResult`
- lowercase for union types representing security modes: `type SecurityMode = "ssl" | "starttls" | "none"`

## Code Style

**Formatting:**
- No explicit prettier configuration file found; code appears to follow standard formatting
- 2-space indentation (inferred from code)
- Semicolons required
- Double quotes for strings

**Linting:**
- Tool: ESLint (flat config in `eslint.config.js`)
- Config file: `/Users/paul/Dev/email-mcp/eslint.config.js`
- Enforced rules:
  - `@typescript-eslint/recommended` base rules
  - `@typescript-eslint/no-explicit-any`: "error" - no `any` types allowed
  - `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: "^_"` - unused parameters must be prefixed with underscore
- Apply to: `src/**/*.ts` files only

## Import Organization

**Order:**
1. External SDK/library imports (e.g., `imapflow`, `nodemailer`, `@modelcontextprotocol/sdk`)
2. Type-only imports from libraries: `import type { ... }`
3. Local relative imports using `.js` extension: `import { ... } from "./imap.js"`

**Pattern (from `src/index.ts`):**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listMailboxes, listEmails, fetchEmail, searchEmails, moveEmail, deleteEmail, markEmail } from "./imap.js";
import { sendEmail } from "./smtp.js";
```

**Path Aliases:**
- Not used; all local imports are relative paths with `.js` extension
- ESM modules enabled (`"type": "module"` in package.json)

## Error Handling

**Patterns:**

1. **Configuration Validation (Early Exit)**
   - Located in `src/index.ts` at startup
   - Required env vars throw `process.exit(1)` via console.error + exit
   ```typescript
   if (!emailAddress) {
     console.error("EMAIL_ADDRESS is required");
     process.exit(1);
   }
   ```

2. **Function-Level Validation**
   - Validation functions throw Error at entry:
   ```typescript
   function getImapConfig(): ImapFlowOptions {
     const host = process.env["IMAP_HOST"];
     if (!host) throw new Error("IMAP_HOST is required");
     // ...
   }
   ```

3. **Try-Finally Pattern (Resource Cleanup)**
   - All IMAP/SMTP client operations use try-finally to ensure logout
   ```typescript
   const client = createClient();
   try {
     await client.connect();
     // operations
   } finally {
     await client.logout().catch(() => {});
   }
   ```

4. **MCP Tool Error Handling**
   - All tool handlers in `src/index.ts` wrap operations in try-catch
   - Errors converted to string and returned as `{ isError: true, content: [...] }`
   ```typescript
   try {
     const result = await listMailboxes();
     return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
   } catch (e) {
     const msg = e instanceof Error ? e.message : String(e);
     return { isError: true, content: [{ type: "text", text: msg }] };
   }
   ```

5. **Partial Failure Handling (Non-Fatal)**
   - Sent folder save failures are caught and logged but don't fail the send
   - Error stored in optional `savedToSentError` field in result
   ```typescript
   let savedToSentError: string | undefined;
   try {
     await appendToMailbox(sentFolder, raw);
     savedToSent = true;
   } catch (e) {
     savedToSentError = e instanceof Error ? e.message : String(e);
     console.error(`[email-mcp] Failed to save to Sent folder: ${savedToSentError}`);
   }
   ```

## Logging

**Framework:** Console (no dedicated logger)

**Patterns:**
- `console.error()` for all output (stderr) - includes startup info, validation failures, and error reporting
- Startup messages logged to stderr in `src/index.ts`:
  ```typescript
  console.error(`email-mcp starting`);
  console.error(`  Email: ${emailAddress}`);
  console.error(`  IMAP: ${imapHost}:${imapPort} (${imapSecurity})`);
  console.error(`  SMTP: ${smtpHost}:${smtpPort} (${smtpSecurity})`);
  ```
- Error context prefixed with service name when needed: `[email-mcp]`
- No log levels or timestamps (all errors use stderr)

## Comments

**When to Comment:**
- Comments are minimal and used for complex logic or IMAP/SMTP-specific behavior
- Inline comments explain the "why" for non-obvious operations:
  - Example: `// newest first: calculate sequence range` in `listEmails()`
  - Example: `// Take last N UIDs (most recent)` in `searchEmails()`
  - Example: `// Build a properly encoded RFC 2822 message...` in `sendEmail()`
  - Example: `// uidMap maps source UID -> destination UID` in `moveEmail()`

**JSDoc/TSDoc:**
- Tool descriptions use JSDoc comments for MCP tool definitions
- Tool descriptions provided as second argument to `server.tool()`:
  ```typescript
  server.tool(
    "list_mailboxes",
    "List available mailboxes/folders",  // Description
    {},
    async () => { ... }
  );
  ```
- Parameter documentation via Zod schema `.describe()` method
- No other JSDoc blocks found; rely on TypeScript inference

## Function Design

**Size:** Moderate length functions (20-60 lines typical)
- Small helper functions: `formatAddress()` (5 lines), `messageToSummary()` (7 lines)
- Medium functions: `listEmails()` (35 lines), `fetchEmail()` (75 lines)
- Larger functions focus on complex operations (email fetching/composition)

**Parameters:**
- Explicit parameters for all required values
- Use Zod schemas for input validation at MCP layer
- Optional parameters with defaults: `mailbox: string = "INBOX"`, `pageSize: number = 20`
- Options pattern for related optional values:
  ```typescript
  interface SendEmailOptions {
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    isHtml?: boolean;
  }
  export async function sendEmail(
    to: string | string[],
    subject: string,
    body: string,
    options: SendEmailOptions = {}
  ): Promise<SendEmailResult>
  ```

**Return Values:**
- All async functions return `Promise<T>` with explicit type
- Interface-based return types: `Promise<ListEmailsResult>`, `Promise<FetchEmailResult>`, `Promise<EmailSummary[]>`
- Result objects include metadata and status:
  ```typescript
  interface ListEmailsResult {
    total: number;
    page: number;
    pageSize: number;
    emails: EmailSummary[];
  }
  ```

## Module Design

**Exports:**
- Functions exported as named exports: `export async function listMailboxes()`
- Internal helpers not exported (remain private to module)
- One main export per module: IMAP module exports all email operations, SMTP module exports sendEmail

**Module Structure:**
- `src/imap.ts` - Config builder, client factory, email operations, result type definitions
- `src/smtp.ts` - Config builder, email composition and sending
- `src/index.ts` - MCP server setup, tool registration, error handling wrapper

**Barrel Files:**
- Not used; direct imports from specific modules
- Each module is self-contained with its own types

## TypeScript Strictness

**Compiler Settings (tsconfig.json):**
- `strict: true` - All strict mode checks enabled
- `noUncheckedIndexedAccess: true` - Require checks on indexed access
- `noUnusedLocals: true` - Error on unused local variables
- `noUnusedParameters: true` - Error on unused parameters (exceptions via `_` prefix)
- No `any` types allowed (ESLint enforced)
- Type annotations required for function parameters and return types

**General Pattern:**
- Explicit return type annotations on all functions
- Nullish coalescing (`??`) preferred over logical OR (`||`) for defaults
- Use `instanceof Error` checks before accessing error.message
- Type guards for optional fields before use

---

*Convention analysis: 2026-03-27*
