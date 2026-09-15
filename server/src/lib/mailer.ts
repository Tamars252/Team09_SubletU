/**
 * Outbound email. Resend is used when a key is present because it is a single
 * HTTPS call — no SMTP client, no new dependency.
 *
 * With no key configured the message is written to the server log instead.
 * That keeps local development working without an account, and config.ts
 * refuses to boot in production without a key, so a real deployment can never
 * quietly swallow a password reset.
 */
import { config, mailerConfigured } from "../config.ts";

export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail): Promise<void> {
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
    // Surfaced to the caller, which logs it. The HTTP response to the user
    // stays generic either way, so a delivery failure cannot be used to work
    // out whether an address is registered.
    throw new Error(`Resend rejected the message (${res.status}): ${await res.text()}`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
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
