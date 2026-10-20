// Pluggable mailer. Resend when RESEND_API_KEY and MAIL_FROM are set; otherwise a no-op.
// Messages carry a link only — never an answer body. Tests leave the env vars unset.

export interface OutboundMail {
  to: string | string[];
  subject: string;
  text: string;
}

function siteOrigin(): string {
  return (process.env.VITE_SITE_URL ?? process.env.SITE_URL ?? '').replace(/\/$/, '');
}

export function trackingUrl(code: string, token: string): string {
  const path = `/track#code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`;
  const origin = siteOrigin();
  return origin ? `${origin}${path}` : path;
}

export async function sendMail(msg: OutboundMail): Promise<void> {
  const key = process.env.RESEND_API_KEY ?? '';
  const from = process.env.MAIL_FROM ?? '';
  if (!key || !from) {
    console.info('[mail] skipped (RESEND_API_KEY or MAIL_FROM unset)');
    return;
  }
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((s) => s.trim()).filter(Boolean);
  if (!to.length) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) console.error(`[mail] provider status ${res.status}`);
}

export async function notifyStaff(subject: string, text: string): Promise<void> {
  const emails = (process.env.NOTIFY_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (emails.length) await sendMail({ to: emails, subject, text });
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chat = process.env.TELEGRAM_CHAT_ID ?? '';
  if (!token || !chat) {
    console.info('[telegram] skipped (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID unset)');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: `${subject}\n${text}`.slice(0, 3500) }),
  });
  if (!res.ok) console.error(`[telegram] provider status ${res.status}`);
}

/** Link only. The answer text is never included. */
export async function notifyAnswerReady(email: string, code: string, token: string): Promise<void> {
  const link = trackingUrl(code, token);
  await sendMail({
    to: email,
    subject: 'התשובה לשאלתכם מוכנה',
    text: `התשובה לשאלתכם מוכנה.\nלצפייה בקישור הפרטי:\n${link}\n\nהקישור הזה הוא הסוד. אין להעביר אותו.`,
  });
}
