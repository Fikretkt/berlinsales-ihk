// E-Mail-Templates auf Deutsch, einfache Sprache.
// HTML ist minimal-styled — Resend rendert das in den meisten Clients sauber.

export interface TemplateContext {
  appUrl: string;
  recipientName: string;
}

function html(body: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>ZalsoSales</title></head>
<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5; color: #111; max-width: 480px; margin: 24px auto; padding: 0 16px;">
${body}
<hr style="margin-top: 32px; border: 0; border-top: 1px solid #e5e7eb;">
<p style="font-size: 12px; color: #6b7280;">ZalsoSales &mdash; Kunden- und Vertriebsmanagement</p>
</body></html>`;
}

export function setupInvitation(ctx: TemplateContext & { setupUrl: string }) {
  const text = `Hallo ${ctx.recipientName},

dein Zugang zu ZalsoSales wurde angelegt.

Klick auf diesen Link, um dein Passwort zu setzen und die App zu starten:
${ctx.setupUrl}

Der Link ist 7 Tage gültig.

Wenn du diese E-Mail nicht erwartet hast, kannst du sie einfach ignorieren.

Viele Grüße
Dein ZalsoSales-Team`;

  const htmlBody = html(`
<h1 style="font-size: 20px; margin: 0 0 16px;">Willkommen bei ZalsoSales</h1>
<p>Hallo ${ctx.recipientName},</p>
<p>dein Zugang ist angelegt. Klick auf den Knopf, um dein Passwort zu setzen:</p>
<p style="margin: 24px 0;">
  <a href="${ctx.setupUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Passwort jetzt setzen</a>
</p>
<p style="font-size: 14px; color: #6b7280;">Der Link ist 7 Tage gültig. Wenn du diese E-Mail nicht erwartet hast, ignoriere sie einfach.</p>
<p style="font-size: 12px; color: #6b7280; word-break: break-all;">Falls der Knopf nicht klickbar ist: ${ctx.setupUrl}</p>
`);

  return {
    subject: "Willkommen bei ZalsoSales — Passwort setzen",
    html: htmlBody,
    text,
  };
}

export function passwordReset(ctx: TemplateContext & { resetUrl: string }) {
  const text = `Hallo ${ctx.recipientName},

du hast ein neues Passwort für ZalsoSales angefordert.

Klick auf diesen Link, um ein neues Passwort zu setzen:
${ctx.resetUrl}

Der Link ist 1 Stunde gültig.

Wenn du das nicht warst, kannst du diese E-Mail ignorieren — dein Passwort bleibt dann unverändert.

Viele Grüße
Dein ZalsoSales-Team`;

  const htmlBody = html(`
<h1 style="font-size: 20px; margin: 0 0 16px;">Passwort zurücksetzen</h1>
<p>Hallo ${ctx.recipientName},</p>
<p>du hast ein neues Passwort angefordert. Klick auf den Knopf, um ein neues zu vergeben:</p>
<p style="margin: 24px 0;">
  <a href="${ctx.resetUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Neues Passwort setzen</a>
</p>
<p style="font-size: 14px; color: #6b7280;">Der Link ist <strong>1 Stunde</strong> gültig. Wenn du das nicht warst, ignoriere diese E-Mail — dein Passwort bleibt unverändert.</p>
<p style="font-size: 12px; color: #6b7280; word-break: break-all;">Falls der Knopf nicht klickbar ist: ${ctx.resetUrl}</p>
`);

  return {
    subject: "ZalsoSales — Passwort zurücksetzen",
    html: htmlBody,
    text,
  };
}
