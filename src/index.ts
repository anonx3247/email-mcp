import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listMailboxes, listEmails, fetchEmail, searchEmails, moveEmail, deleteEmail } from "./imap.js";
import { sendEmail } from "./smtp.js";

// Validate required env vars
const emailAddress = process.env["EMAIL_ADDRESS"];
const imapHost = process.env["IMAP_HOST"];
const smtpHost = process.env["SMTP_HOST"];
const imapSecurity = process.env["IMAP_SECURITY"] ?? "ssl";
const smtpSecurity = process.env["SMTP_SECURITY"] ?? "ssl";
const emailPassword = process.env["EMAIL_PASSWORD"];

if (!emailAddress) {
  console.error("EMAIL_ADDRESS is required");
  process.exit(1);
}
if (!imapHost) {
  console.error("IMAP_HOST is required");
  process.exit(1);
}
if (!smtpHost) {
  console.error("SMTP_HOST is required");
  process.exit(1);
}
if (!emailPassword && imapSecurity !== "none") {
  console.error("EMAIL_PASSWORD is required when IMAP_SECURITY is not 'none'");
  process.exit(1);
}
if (!emailPassword && smtpSecurity !== "none") {
  console.error("EMAIL_PASSWORD is required when SMTP_SECURITY is not 'none'");
  process.exit(1);
}

const imapPort = process.env["IMAP_PORT"] ?? (imapSecurity === "ssl" ? "993" : "143");
const smtpPort = process.env["SMTP_PORT"] ?? (smtpSecurity === "ssl" ? "465" : smtpSecurity === "starttls" ? "587" : "25");

console.error(`email-mcp starting`);
console.error(`  Email: ${emailAddress}`);
console.error(`  IMAP: ${imapHost}:${imapPort} (${imapSecurity})`);
console.error(`  SMTP: ${smtpHost}:${smtpPort} (${smtpSecurity})`);

const server = new McpServer({
  name: "email-mcp",
  version: "0.1.0",
});

server.tool(
  "list_mailboxes",
  "List available mailboxes/folders",
  {},
  async () => {
    try {
      const mailboxes = await listMailboxes();
      return {
        content: [{ type: "text", text: JSON.stringify(mailboxes, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "list_emails",
  "List emails in a mailbox with pagination (newest first)",
  {
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    page: z.number().int().min(1).default(1).describe("Page number"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Emails per page"),
  },
  async ({ mailbox, page, pageSize }) => {
    try {
      const result = await listEmails(mailbox, page, pageSize);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "fetch_email",
  "Fetch a single email by UID with full body and attachment info",
  {
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    uid: z.number().int().describe("Email UID"),
  },
  async ({ mailbox, uid }) => {
    try {
      const result = await fetchEmail(mailbox, uid);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "search_emails",
  "Search emails by various criteria",
  {
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    from: z.string().optional().describe("From address to match"),
    to: z.string().optional().describe("To address to match"),
    subject: z.string().optional().describe("Subject to match"),
    since: z.string().optional().describe("Messages since date (ISO format)"),
    before: z.string().optional().describe("Messages before date (ISO format)"),
    body: z.string().optional().describe("Body text to match"),
    seen: z.boolean().optional().describe("Filter by read/unread status"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Max results"),
  },
  async ({ mailbox, from, to, subject, since, before, body, seen, limit }) => {
    try {
      const result = await searchEmails(
        mailbox,
        { from, to, subject, since, before, body, seen },
        limit
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "send_email",
  "Send an email via SMTP",
  {
    to: z
      .union([z.string(), z.array(z.string())])
      .describe("Recipient(s)"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body"),
    cc: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("CC recipient(s)"),
    bcc: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("BCC recipient(s)"),
    replyTo: z.string().optional().describe("Reply-To address"),
    isHtml: z
      .boolean()
      .default(false)
      .describe("Whether body is HTML"),
  },
  async ({ to, subject, body, cc, bcc, replyTo, isHtml }) => {
    try {
      const result = await sendEmail(to, subject, body, {
        cc,
        bcc,
        replyTo,
        isHtml,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "move_email",
  "Move an email to another mailbox/folder (e.g. archive, junk, sent)",
  {
    mailbox: z.string().default("INBOX").describe("Source mailbox path"),
    uid: z.number().int().describe("Email UID to move"),
    destination: z.string().describe("Destination mailbox path (e.g. Archive, Junk, Trash)"),
  },
  async ({ mailbox, uid, destination }) => {
    try {
      const result = await moveEmail(mailbox, uid, destination);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

server.tool(
  "delete_email",
  "Permanently delete an email (sets \\Deleted flag and expunges)",
  {
    mailbox: z.string().default("INBOX").describe("Mailbox path"),
    uid: z.number().int().describe("Email UID to delete"),
  },
  async ({ mailbox, uid }) => {
    try {
      const result = await deleteEmail(mailbox, uid);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("email-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
