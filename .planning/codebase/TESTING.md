# Testing Patterns

**Analysis Date:** 2026-03-27

## Test Framework

**Status:** Not detected

**Test Infrastructure:** None present

The codebase has **no test files, test framework, or test configuration**:
- No `jest.config.*`, `vitest.config.*`, or similar test runner configs
- No `*.test.ts` or `*.spec.ts` files in source
- No testing dependencies in `package.json`
- No test script in package.json scripts (only `lint`, `typecheck`, `build`)

## Test File Organization

**Not applicable** - no tests present in codebase

**Proposed Pattern (if tests were added):**
- **Location:** Co-located with source files (same directory as implementation)
- **Naming Convention:** `[filename].test.ts` for unit tests
  - Example: `src/imap.test.ts` alongside `src/imap.ts`
  - Example: `src/smtp.test.ts` alongside `src/smtp.ts`
  - Example: `src/index.test.ts` alongside `src/index.ts`

## Testing Framework Recommendation

**For this codebase, recommend one of:**

1. **Vitest** (faster, modern, ESM native)
   - Excellent TypeScript support
   - Fast execution
   - Compatible with existing ESM-only setup
   - Minimal config needed

2. **Jest with ESM support**
   - Mature, widely adopted
   - Requires `--experimental-vm-modules` or bun/tsx compatibility
   - More complex setup for ESM

## Test Structure

**Hypothetical Structure Pattern:**

```typescript
// Example structure for src/imap.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listMailboxes, listEmails, fetchEmail } from "./imap";

describe("IMAP Operations", () => {
  beforeEach(() => {
    // Setup: mock environment variables
    process.env.IMAP_HOST = "test.example.com";
    process.env.EMAIL_ADDRESS = "test@example.com";
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
  });

  describe("listMailboxes()", () => {
    it("should list mailboxes", async () => {
      const result = await listMailboxes();
      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toHaveProperty("name");
    });
  });
});
```

## Mocking Strategy (If Implemented)

**Recommendations:**

**What to Mock:**
- External IMAP client (`ImapFlow`) - avoid real network calls
- Nodemailer transporter - avoid sending real emails
- Environment variables - control configuration in tests
- File system operations - if any are added

**What NOT to Mock:**
- Type definitions/interfaces
- Pure utility functions (`formatAddress()`, `messageToSummary()`)
- Zod validation schemas - test actual validation behavior
- Error handling code paths - test with real errors

**Mocking Framework:** `vitest` with `vi.mock()` or `vi.spyOn()`

**Pattern Example (hypothetical):**
```typescript
import { vi } from "vitest";
import { ImapFlow } from "imapflow";

// Mock ImapFlow client
vi.mock("imapflow", () => ({
  ImapFlow: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([
      {
        name: "INBOX",
        path: "INBOX",
        delimiter: "/",
        flags: new Set(),
        specialUse: "\\All",
      },
    ]),
    logout: vi.fn().mockResolvedValue(undefined),
  })),
}));
```

## Test Coverage Gaps

**Critical Areas Without Tests:**

1. **IMAP Operations** (`src/imap.ts`)
   - `listMailboxes()` - mailbox enumeration
   - `listEmails()` - pagination logic, newest-first ordering
   - `fetchEmail()` - full message retrieval, attachment extraction
   - `searchEmails()` - search criteria translation
   - `moveEmail()` - cross-mailbox operations
   - `deleteEmail()` - permanent deletion
   - `markEmail()` - flag operations
   - Helper functions: `collectAttachments()`, `findPart()`, `formatAddress()`

2. **SMTP Operations** (`src/smtp.ts`)
   - `sendEmail()` - email sending, recipient handling
   - Sent folder saving logic
   - HTML vs. text body selection
   - CC/BCC/Reply-To handling

3. **MCP Server Integration** (`src/index.ts`)
   - Tool registration and invocation
   - Error handling in MCP handlers (wrapping errors as text)
   - Configuration validation and startup
   - Environment variable resolution

4. **Configuration & Initialization** (all modules)
   - `getImapConfig()` - config builder, security mode handling
   - `getSmtpConfig()` - SMTP-specific port defaults
   - Environment variable fallbacks and defaults
   - Missing required variables error paths

5. **Error Handling**
   - Network errors from IMAP/SMTP
   - Invalid UID handling
   - Malformed email data
   - Authentication failures
   - Timeout scenarios

6. **Integration Scenarios**
   - Full send + save to sent folder flow
   - List + fetch + move combined operations
   - Search with multiple criteria
   - Pagination boundary conditions

## Test Patterns to Implement

**Async Testing:**
```typescript
// Pattern: Use async/await in test functions
it("should list emails", async () => {
  const result = await listEmails("INBOX");
  expect(result.emails).toBeInstanceOf(Array);
});

// Or use vi.waitFor for polling
it("should eventually connect", async () => {
  await vi.waitFor(() => {
    expect(connectSpy).toHaveBeenCalled();
  });
});
```

**Error Testing:**
```typescript
// Pattern: Test error throws
it("should throw if IMAP_HOST missing", async () => {
  delete process.env.IMAP_HOST;
  await expect(getImapConfig()).rejects.toThrow("IMAP_HOST is required");
});

// Pattern: Test error handling in try-catch
it("should return error response", async () => {
  // Mock client to throw
  const result = await callMcpTool(); // returns { isError: true, ... }
  expect(result.isError).toBe(true);
});
```

**Configuration Testing:**
```typescript
// Pattern: Test fallbacks and defaults
it("should use default IMAP port for SSL", () => {
  process.env.IMAP_SECURITY = "ssl";
  delete process.env.IMAP_PORT;
  const config = getImapConfig();
  expect(config.port).toBe(993);
});

it("should use port 143 for non-SSL", () => {
  process.env.IMAP_SECURITY = "none";
  delete process.env.IMAP_PORT;
  const config = getImapConfig();
  expect(config.port).toBe(143);
});
```

## Priority Test Cases (if implementing)

**HIGH PRIORITY:**
1. Environment variable validation - missing required vars
2. IMAP pagination logic - off-by-one errors in range calculation
3. Attachment collection - recursive tree walking correctness
4. Error wrapping - all MCP tool error paths return proper format
5. SMTP send + save flow - both operations succeed or partial failure handled

**MEDIUM PRIORITY:**
6. Search criteria translation - all query fields map correctly
7. Email formatting - addresses, dates, body content
8. Security configuration - SSL, STARTTLS, no-auth modes
9. Message move operation - UID mapping handling
10. Flag operations - read/unread state changes

**LOWER PRIORITY:**
11. Mailbox listing edge cases
12. HTML vs text body selection logic
13. Unused parameter patterns (underscore prefix)

## Run Commands (Proposed)

```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode during development
npm run test:coverage   # Generate coverage report
npm run test:ui         # Vitest UI (if using Vitest)
```

**To implement, add to `package.json` scripts:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

*Testing analysis: 2026-03-27*
