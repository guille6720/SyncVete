import { APP_CANONICAL_HOST } from '@sincvete/shared';

export function getAppOrigin(headerStore: Headers): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;

  const forwardedHost = headerStore.get('x-forwarded-host');
  const host = forwardedHost ?? headerStore.get('host');
  const proto = headerStore.get('x-forwarded-proto') ?? 'https';
  if (host && !host.includes('localhost')) return `${proto}://${host}`;

  if (process.env.NODE_ENV === 'production') {
    return `https://${APP_CANONICAL_HOST}`;
  }

  return 'http://localhost:3000';
}
