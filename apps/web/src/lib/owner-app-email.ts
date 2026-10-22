import 'server-only';
import { ownerAppEnabled } from '@/lib/owner-app';

export async function sendOwnerAppEmail(
  email: string,
  subject: string,
  text: string,
  idempotencyKey: string
): Promise<boolean> {
  if (!ownerAppEnabled()) throw new Error('Owner app is not enabled');
  const key = process.env.OWNER_APP_RESEND_API_KEY;
  const from = process.env.OWNER_APP_EMAIL_FROM;
  if (!key || !from) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ from, to: [email], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  return response.ok;
}

/** Public origin used in invite / install links (staging or production). */
export function ownerAppOrigin(): string {
  const raw = process.env.OWNER_APP_ORIGIN || process.env.OWNER_APP_STAGING_ORIGIN;
  if (!raw) throw new Error('Missing OWNER_APP_ORIGIN');
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  ) {
    throw new Error('Invalid owner app origin');
  }
  return url.origin;
}
