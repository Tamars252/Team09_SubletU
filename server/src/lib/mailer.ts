/**
 * Outbound email. Resend is used when a key is present because it is a single
 * HTTPS call — no SMTP client, no new dependency.
 *
 * With no key configured, or when Resend rejects a message (e.g. the sending
 * domain isn't verified, so only the account's own address can receive mail),
 * the content is written to the server log instead of being delivered. That
 * keeps registration and password reset working without a verified domain —
 * check the log for the code or link rather than an inbox. This fallback is for
 * development only: in production a rejection throws, and config.ts refuses to boot
 * without a key.
 */
import fs from "node:fs";
import { config, mailerConfigured } from "../config.ts";

export type Mail = { to: string; subject: string; text: string; html: string };

/**
 * When MAIL_LOG_FILE is set, every message is also appended there as JSON.
 * The end-to-end suite reads it to pick up verification codes and reset links,
 * which is the only way a browser test can act on something that leaves by
 * email. It does nothing unless a path is configured, and production requires
 * a real mailer regardless.
 */
function recordToSink(mail: Mail): void {
  const path = process.env.MAIL_LOG_FILE;
  if (!path) return;
  try {
    fs.appendFileSync(path, `${JSON.stringify({ ...mail, at: new Date().toISOString() })}\n`);
  } catch (err) {
    console.warn("[mail] could not write to MAIL_LOG_FILE:", (err as Error).message);
  }
}

export async function sendMail(mail: Mail): Promise<void> {
  recordToSink(mail);

  if (!mailerConfigured) {
    console.log(
      [
        "",
        "  ┌─ email (no RESEND_API_KEY set — not actually sent) ──────────",
        `  │ to:      ${mail.to}`,
        `  │ subject: ${mail.subject}`,
        ...mail.text.split("\n").map((line) => `  │ ${line}`),
        "  └──────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const detail = `Resend rejected the message (${res.status}): ${await res.text()}`;

    // In production, never write codes or reset links to the log — surface the
    // failure to the caller, which logs it. The HTTP response to the user stays
    // generic either way, so a delivery failure cannot be used to work out
    // whether an address is registered.
    if (config.isProd) throw new Error(detail);

    // Without a verified sending domain, Resend only delivers to the
    // account's own address — every other recipient gets rejected here. Log
    // the content instead of throwing, so a registration or reset request
    // still succeeds and the code/link can be read from the server log.
    console.warn(`[mail] ${detail}`);
    console.log(
      [
        "",
        "  ┌─ email (Resend could not deliver this — content below) ──────",
        `  │ to:      ${mail.to}`,
        `  │ subject: ${mail.subject}`,
        ...mail.text.split("\n").map((line) => `  │ ${line}`),
        "  └──────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export function verificationEmail(name: string, code: string, minutes: number): Mail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const text = [
    greeting,
    "",
    "Your SubletU verification code is:",
    "",
    `    ${spaced}`,
    "",
    `It expires in ${minutes} minutes.`,
    "If you didn't try to create a SubletU account, you can ignore this email.",
    "",
    "— SubletU",
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2B2724">
      <h1 style="font-size:20px;margin:0 0 16px">Confirm your Syracuse email</h1>
      <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 18px">Enter this code in SubletU to finish setting up your account:</p>
      <p style="margin:0 0 22px;font-size:34px;font-weight:700;letter-spacing:9px;color:#D4603A">
        ${escapeHtml(spaced)}
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6B625C">It expires in ${minutes} minutes.</p>
      <p style="margin:0;font-size:13px;color:#6B625C">
        If you didn't try to create a SubletU account, you can ignore this email.
      </p>
    </div>`;

  return { to: "", subject: `${spaced} is your SubletU code`, text, html };
}

export function passwordResetEmail(name: string, link: string, minutes: number): Mail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = [
    greeting,
    "",
    "Someone asked to reset the password on your SubletU account.",
    "Open this link to choose a new one:",
    "",
    link,
    "",
    `The link works once and expires in ${minutes} minutes.`,
    "If this wasn't you, ignore this email — your password stays as it is.",
    "",
    "— SubletU",
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2B2724">
      <h1 style="font-size:20px;margin:0 0 16px">Reset your SubletU password</h1>
      <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px">Someone asked to reset the password on your SubletU account.</p>
      <p style="margin:0 0 24px">
        <a href="${escapeHtml(link)}"
           style="display:inline-block;background:#D4603A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">
          Choose a new password
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6B625C">
        The link works once and expires in ${minutes} minutes.
      </p>
      <p style="margin:0;font-size:13px;color:#6B625C">
        If this wasn't you, ignore this email — your password stays as it is.
      </p>
    </div>`;

  return { to: "", subject: "Reset your SubletU password", text, html };
}
