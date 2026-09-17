import { APP_CANONICAL_HOST } from '@sincvete/shared';
import { readServerEnv } from '@/lib/server-env';

export type MailProvider = 'resend' | 'smtp' | 'none';

export function getMailFrom(): { email: string; name: string } {
  const email = (readServerEnv('MAIL_FROM_EMAIL') || 'soporte@opusorg.com').trim();
  const name = (readServerEnv('MAIL_FROM_NAME') || 'SyncVete').trim();
  return { email, name };
}

export function resolveMailProvider(): MailProvider {
  if (readServerEnv('RESEND_API_KEY')) return 'resend';
  if (readServerEnv('SMTP_HOST') && readServerEnv('SMTP_USER') && readServerEnv('SMTP_PASS')) {
    return 'smtp';
  }
  return 'none';
}

/** Public app origin for email CTAs — prefers NEXT_PUBLIC_APP_URL (staging/prod). */
export function resolveAppOrigin(headerStore?: Headers | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;

  if (headerStore) {
    const forwardedHost = headerStore.get('x-forwarded-host');
    const host = forwardedHost ?? headerStore.get('host');
    const proto = headerStore.get('x-forwarded-proto') ?? 'https';
    if (host && !host.includes('localhost')) return `${proto}://${host}`;
  }

  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  }

  if (process.env.NODE_ENV === 'production') {
    return `https://${APP_CANONICAL_HOST}`;
  }

  return 'http://localhost:3000';
}

export function recipientDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : 'unknown';
}
