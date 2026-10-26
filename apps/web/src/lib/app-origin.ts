import { APP_CANONICAL_HOST } from '@sincvete/shared';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLoopbackUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url.includes('://') ? url : `https://${url}`).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function originFromHost(host: string, proto = 'https'): string {
  const clean = host.split(',')[0]?.trim() ?? host;
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return stripTrailingSlash(clean);
  }
  return `${proto}://${clean}`;
}

/**
 * Public origin for Auth redirects (invite, recovery, OTP).
 * Never returns localhost when running on Vercel or when the request host is public —
 * a mis-set NEXT_PUBLIC_APP_URL=http://localhost:3000 must not break staging invites.
 */
export function getAppOrigin(headerStore: Headers): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
    ? stripTrailingSlash(process.env.NEXT_PUBLIC_APP_URL)
    : null;

  const forwardedHost = headerStore.get('x-forwarded-host');
  const host = forwardedHost ?? headerStore.get('host');
  const proto = headerStore.get('x-forwarded-proto') ?? 'https';

  if (host && !isLoopbackUrl(host)) {
    return originFromHost(host, proto);
  }

  if (configured && !isLoopbackUrl(configured)) {
    return configured;
  }

  const vercelUrl = process.env.VERCEL_URL ? stripTrailingSlash(process.env.VERCEL_URL) : null;
  if (vercelUrl && !isLoopbackUrl(vercelUrl)) {
    return originFromHost(vercelUrl, 'https');
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return `https://${APP_CANONICAL_HOST}`;
  }

  return 'http://localhost:3000';
}
