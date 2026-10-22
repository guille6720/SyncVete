export function ownerAppInstallUrl(organizationId: string): string {
  return `/portal/instalar/${encodeURIComponent(organizationId)}`;
}

// Only local, known portal destinations are accepted by authentication actions.
export function safeOwnerPortalRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('\\') || !value.startsWith('/portal/'))
    return null;
  try {
    const url = new URL(value, 'https://portal.local');
    if (url.origin !== 'https://portal.local') return null;
    if (
      url.pathname === '/portal/activar' &&
      /^[a-f0-9]{64}$/i.test(url.searchParams.get('token') ?? '')
    )
      return `/portal/activar?token=${url.searchParams.get('token')}`;
    if (/^\/portal\/app\/[0-9a-f-]{36}$/i.test(url.pathname)) return url.pathname;
  } catch {
    /* malformed destination */
  }
  return null;
}
