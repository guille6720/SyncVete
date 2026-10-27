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
 * Vercel per-deploy hosts like `app-abc123xy-team.vercel.app` change every push.
 * Invite/recovery emails must not point there or users land on dead/old builds.
 */
export function isEphemeralVercelDeploymentHost(hostOrUrl: string): boolean {
  try {
    const host = (
      hostOrUrl.includes('://') ? new URL(hostOrUrl).hostname : hostOrUrl.split(',')[0]?.trim()
    )?.toLowerCase();
    if (!host || !host.endsWith('.vercel.app')) return false;
    if (host.includes('-git-')) return false; // stable branch alias
    // Deployment URL: {project}-{hash}-{team}.vercel.app (hash ~8–14 chars)
    return /-[a-z0-9]{8,14}-[a-z0-9-]+\.vercel\.app$/i.test(host);
  } catch {
    return false;
  }
}

/**
 * Public origin for Auth redirects (invite, recovery, OTP).
 * Prefer the configured stable app URL over ephemeral Vercel deployment hosts.
 */
export function getAppOrigin(headerStore: Headers): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
    ? stripTrailingSlash(process.env.NEXT_PUBLIC_APP_URL)
    : null;

  if (configured && !isLoopbackUrl(configured)) {
    return configured;
  }

  const branchUrl = process.env.VERCEL_BRANCH_URL
    ? stripTrailingSlash(process.env.VERCEL_BRANCH_URL)
    : null;
  if (branchUrl && !isLoopbackUrl(branchUrl)) {
    return originFromHost(branchUrl, 'https');
  }

  const forwardedHost = headerStore.get('x-forwarded-host');
  const host = forwardedHost ?? headerStore.get('host');
  const proto = headerStore.get('x-forwarded-proto') ?? 'https';

  if (host && !isLoopbackUrl(host) && !isEphemeralVercelDeploymentHost(host)) {
    return originFromHost(host, proto);
  }

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? stripTrailingSlash(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    : null;
  if (productionUrl && !isLoopbackUrl(productionUrl)) {
    return originFromHost(productionUrl, 'https');
  }

  if (host && !isLoopbackUrl(host)) {
    return originFromHost(host, proto);
  }

  const vercelUrl = process.env.VERCEL_URL ? stripTrailingSlash(process.env.VERCEL_URL) : null;
  if (vercelUrl && !isLoopbackUrl(vercelUrl) && !isEphemeralVercelDeploymentHost(vercelUrl)) {
    return originFromHost(vercelUrl, 'https');
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return `https://${APP_CANONICAL_HOST}`;
  }

  return 'http://localhost:3000';
}
