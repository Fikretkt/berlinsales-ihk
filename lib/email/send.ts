// E-Mail-Versand via Resend.
// Dev-Fallback: Console-Log (wenn RESEND_API_KEY fehlt).
// Bei Versand-Fehler: keine Exception, sondern Result mit error — Caller schreibt
// dann audit_log mit Event "user_invited_email_failed" (laut Lastenheft 4.9).

import { Resend } from "resend";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  channel: "resend" | "console";
}

let cachedResend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedResend) cachedResend = new Resend(key);
  return cachedResend;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const resend = getResend();
  if (!resend) {
    // Dev-Fallback: in Konsole loggen statt zu senden.
    console.log("\n========== [DEV-MAIL — kein RESEND_API_KEY] ==========");
    console.log(`To:      ${input.to}`);
    console.log(`Subject: ${input.subject}`);
    console.log("--- Text ---");
    console.log(input.text);
    console.log("======================================================\n");
    return { ok: true, channel: "console", messageId: "dev-console" };
  }

  const from = process.env.EMAIL_FROM ?? "noreply@itmart.example.com";
  try {
    const res = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (res.error) {
      return { ok: false, channel: "resend", error: res.error.message };
    }
    return { ok: true, channel: "resend", messageId: res.data?.id };
  } catch (err) {
    return {
      ok: false,
      channel: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
