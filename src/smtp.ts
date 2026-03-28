import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { appendToMailbox } from "./imap.js";

type SecurityMode = "ssl" | "starttls" | "none";

function getSmtpConfig(): SMTPTransport.Options {
  const host = process.env["SMTP_HOST"];
  if (!host) throw new Error("SMTP_HOST is required");

  const security: SecurityMode =
    (process.env["SMTP_SECURITY"] as SecurityMode | undefined) ?? "ssl";
  const defaultPort =
    security === "ssl" ? 465 : security === "starttls" ? 587 : 25;
  const port = parseInt(process.env["SMTP_PORT"] ?? String(defaultPort), 10);
  const sslVerify = process.env["SSL_VERIFY"] !== "false";

  const username =
    process.env["EMAIL_USERNAME"] ?? process.env["EMAIL_ADDRESS"] ?? "";
  const password = process.env["EMAIL_PASSWORD"] ?? "";

  const config: SMTPTransport.Options = {
    host,
    port,
    secure: security === "ssl",
    requireTLS: security === "starttls",
    tls: {
      rejectUnauthorized: sslVerify,
    },
  };

  if (password || security !== "none") {
    config.auth = { user: username, pass: password };
  }

  return config;
}

interface SendEmailOptions {
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  isHtml?: boolean;
}

interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  savedToSent: boolean;
  savedToSentError?: string;
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  body: string,
  options: SendEmailOptions = {}
): Promise<SendEmailResult> {
  const transporter: Transporter = nodemailer.createTransport(getSmtpConfig());
  const from = process.env["EMAIL_ADDRESS"];
  if (!from) throw new Error("EMAIL_ADDRESS is required");

  const toStr = Array.isArray(to) ? to.join(", ") : to;
  const ccStr = options.cc
    ? Array.isArray(options.cc)
      ? options.cc.join(", ")
      : options.cc
    : undefined;
  const bccStr = options.bcc
    ? Array.isArray(options.bcc)
      ? options.bcc.join(", ")
      : options.bcc
    : undefined;

  const mailOptions = {
    from,
    to: toStr,
    subject,
    ...(options.isHtml ? { html: body } : { text: body }),
    ...(ccStr ? { cc: ccStr } : {}),
    ...(bccStr ? { bcc: bccStr } : {}),
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    const sentFolder = process.env["SENT_FOLDER"] ?? "Sent";

    // Build a properly encoded RFC 2822 message using the actual Message-ID
    // that was assigned during send. MailComposer handles non-ASCII encoding,
    // BCC headers, and attachments correctly.
    const raw = await new MailComposer({
      ...mailOptions,
      messageId: info.messageId,
    })
      .compile()
      .build();

    let savedToSent = false;
    let savedToSentError: string | undefined;
    try {
      await appendToMailbox(sentFolder, raw);
      savedToSent = true;
    } catch (e) {
      savedToSentError = e instanceof Error ? e.message : String(e);
      console.error(`[email-mcp] Failed to save to Sent folder: ${savedToSentError}`);
    }

    return {
      messageId: info.messageId,
      accepted: info.accepted as string[],
      rejected: info.rejected as string[],
      savedToSent,
      ...(savedToSentError ? { savedToSentError } : {}),
    };
  } finally {
    transporter.close();
  }
}
