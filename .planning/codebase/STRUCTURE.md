# Codebase Structure

**Analysis Date:** 2026-03-27

## Directory Layout

```
email-mcp/
├── src/                    # TypeScript source (ESM)
│   ├── index.ts           # MCP server, tool handlers, validation
│   ├── imap.ts            # IMAP operations (read, search, move, delete)
│   └── smtp.ts            # SMTP operations (send, save to sent)
├── server/                # Compiled output (generated)
│   ├── index.js           # Bundled and minified MCP server
│   ├── index.js.map       # Source map
│   └── index.d.ts         # TypeScript declarations
├── node_modules/          # Dependencies
├── .planning/             # GSD planning documents
├── .git/                  # Git repository
├── package.json           # Dependencies, scripts, entry point
├── package-lock.json      # Dependency lock
├── tsconfig.json          # TypeScript compiler config
├── tsup.config.ts         # Bundler config (ESM, ES2022, Node22)
├── manifest.json          # MCP extension manifest with user config schema
├── eslint.config.js       # Linter config (ESLint 9+, flat config)
├── README.md              # User documentation
├── CLAUDE.md              # Developer notes
├── email-mcp.mcpb         # Packaged extension for Claude Desktop
└── .gitignore             # Excludes node_modules, server, .DS_Store
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript source code
- Contains: ESM TypeScript files (.ts)
- Key files: `index.ts` (entry point), `imap.ts`, `smtp.ts`

**server/:**
- Purpose: Compiled JavaScript output
- Contains: Bundled ESM JavaScript, source maps, type declarations
- Generated: Yes, from tsup build
- Committed: No (.gitignore excludes)

**node_modules/:**
- Purpose: npm dependencies
- Contains: @modelcontextprotocol/sdk, imapflow, nodemailer, zod, and dev tools
- Generated: Yes, from npm install
- Committed: No

**.planning/codebase/:**
- Purpose: GSD analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Contains: Markdown documentation for code navigation
- Committed: Yes

## Key File Locations

**Entry Points:**
- `src/index.ts` - Main MCP server, tool definitions, protocol handler
- `package.json` "main": `server/index.js` - Compiled entry point
- `package.json` "bin": `server/index.js` - CLI executable entry
- `manifest.json` "entry_point": `server/index.js` - MCP extension entry

**Configuration:**
- `.env` (implied, not in repo) - Runtime secrets (EMAIL_ADDRESS, EMAIL_PASSWORD, IMAP_HOST, SMTP_HOST, etc.)
- `manifest.json` - User config schema, tool definitions, version metadata
- `package.json` - Build scripts, dependencies
- `tsconfig.json` - TypeScript strict mode, output directory, module format
- `tsup.config.ts` - Bundler: ESM, Node22 target, executable shebang

**Core Logic:**
- `src/imap.ts` - IMAP client initialization, connection pooling, email operations (list, fetch, search, move, delete)
- `src/smtp.ts` - SMTP transporter initialization, email sending, sent folder persistence
- `src/index.ts` - MCP protocol implementation, tool parameter validation with Zod

**Build Output:**
- `server/index.js` - Bundled, executable JavaScript with shebang
- `server/index.d.ts` - Full TypeScript type declarations
- `server/index.js.map` - Source map for debugging

## Naming Conventions

**Files:**
- Source files: lowercase with `.ts` extension (e.g., `index.ts`, `imap.ts`, `smtp.ts`)
- Output files: lowercase with `.js` extension (e.g., `index.js`)
- Configuration files: camelCase for custom configs (e.g., `tsup.config.ts`, `eslint.config.js`)
- Manifest/metadata: lowercase with `.json` extension (e.g., `package.json`, `manifest.json`)

**Directories:**
- Source: lowercase single-word names (e.g., `src`, `server`, `.planning`)
- Special directories: dot-prefix for dotfiles (e.g., `.git`, `.planning`)

**TypeScript/JavaScript:**
- Functions: camelCase (e.g., `listMailboxes`, `fetchEmail`, `getImapConfig`)
- Types/Interfaces: PascalCase (e.g., `EmailSummary`, `FetchEmailResult`, `SecurityMode`)
- Constants: UPPER_CASE for config constants, camelCase for config objects
- Exports: Named exports (e.g., `export async function listEmails()`) rather than default exports

**Environment Variables:**
- UPPER_SNAKE_CASE (e.g., `EMAIL_ADDRESS`, `IMAP_HOST`, `SMTP_SECURITY`, `SSL_VERIFY`)

## Where to Add New Code

**New Tool (MCP Operation):**
- Protocol handler: Add `server.tool()` call in `src/index.ts` with Zod schema validation
- Domain logic: Add function to `src/imap.ts` or `src/smtp.ts`
- Example: To add "archive_email", add tool in index.ts calling new archiveEmail() function in imap.ts

**New IMAP Operation:**
- Location: `src/imap.ts`
- Pattern: Create async function with IMAP client lifecycle (createClient, connect, operation, cleanup in finally, logout)
- Type safety: Define interfaces for return types (e.g., `interface ArchiveEmailResult`)
- Export: Use `export async function` for public operations called by index.ts

**New SMTP Operation:**
- Location: `src/smtp.ts`
- Pattern: Create async function that uses getSmtpConfig(), creates Nodemailer transporter, closes in finally
- Type safety: Define interfaces for return types (e.g., `interface CustomSendResult`)
- Integration: Use existing IMAP functions for mailbox operations (e.g., appendToMailbox for save-to-sent)

**Utilities (Shared Helpers):**
- Location: `src/` as separate file (e.g., `src/utils.ts`, `src/types.ts`)
- Export: Use named exports
- Usage: Import in index.ts, imap.ts, smtp.ts as needed

**Configuration Additions:**
- Env vars: Add to `getImapConfig()` or `getSmtpConfig()` functions
- Manifest: Update `manifest.json` user_config and tools sections
- Validation: Add startup checks in `src/index.ts` lines 15-34

## Special Directories

**server/ (Compiled Output):**
- Purpose: Contains built JavaScript and type declarations
- Generated: Yes, by `npm run build` (tsup)
- Committed: No (in .gitignore)
- Auto-cleanup: tsup runs with clean: true, removes old builds

**.planning/codebase/ (GSD Documents):**
- Purpose: Stores ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md
- Generated: No (manually maintained)
- Committed: Yes (supports future code generation)

**node_modules/:**
- Purpose: npm package cache
- Generated: Yes, by `npm install`
- Committed: No (in .gitignore)

## Build Pipeline

**Development:**
```bash
npm run dev      # tsup --watch (rebuild on file changes)
npm run typecheck # tsc --noEmit (type checking only)
npm run lint     # eslint src/ (code quality)
```

**Production:**
```bash
npm run build       # tsup (bundles src/ to server/)
npm run build:mcpb  # npm run build && mcpb pack (creates .mcpb extension)
npm run start       # node server/index.js (runs compiled server)
```

---

*Structure analysis: 2026-03-27*
