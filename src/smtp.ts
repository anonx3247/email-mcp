import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

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

  try {
    const info = await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      ...(options.isHtml ? { html: body } : { text: body }),
      ...(options.cc
        ? { cc: Array.isArray(options.cc) ? options.cc.join(", ") : options.cc }
        : {}),
      ...(options.bcc
        ? {
            bcc: Array.isArray(options.bcc)
              ? options.bcc.join(", ")
              : options.bcc,
          }
        : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });

    return {
      messageId: info.messageId,
      accepted: info.accepted as string[],
      rejected: info.rejected as string[],
    };
  } finally {
    transporter.close();
  }
}
