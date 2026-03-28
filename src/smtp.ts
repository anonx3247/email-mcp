import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
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
}

interface RawMessageOptions {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  isHtml: boolean;
  messageId: string;
  date: Date;
}

function buildRawMessage(opts: RawMessageOptions): Buffer {
  const contentType = opts.isHtml
    ? "text/html; charset=utf-8"
    : "text/plain; charset=utf-8";

  const lines: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${opts.subject}`,
    `Date: ${opts.date.toUTCString()}`,
    `Message-ID: ${opts.messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}`,
    ``,
    opts.body,
  ];

  return Buffer.from(lines.join("\r\n"), "utf-8");
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

  try {
    const info = await transporter.sendMail({
      from,
      to: toStr,
      subject,
      ...(options.isHtml ? { html: body } : { text: body }),
      ...(ccStr ? { cc: ccStr } : {}),
      ...(bccStr ? { bcc: bccStr } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });

    const sentFolder = process.env["SENT_FOLDER"] ?? "Sent";
    const raw = buildRawMessage({
      from,
      to: toStr,
      cc: ccStr,
      subject,
      body,
      isHtml: options.isHtml ?? false,
      messageId: info.messageId,
      date: new Date(),
    });

    let savedToSent = false;
    try {
      await appendToMailbox(sentFolder, raw);
      savedToSent = true;
    } catch {
      // Non-fatal: send succeeded even if Sent copy fails
    }

    return {
      messageId: info.messageId,
      accepted: info.accepted as string[],
      rejected: info.rejected as string[],
      savedToSent,
    };
  } finally {
    transporter.close();
  }
}
