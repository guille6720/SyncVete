export const PORTAL_INVITE_DAYS = 7;

export const PORTAL_ACCESS_STATUSES = ['inactive', 'invited', 'active'] as const;

export type PortalAccessStatus = (typeof PORTAL_ACCESS_STATUSES)[number];

export const PORTAL_ACCESS_STATUS_LABELS: Record<PortalAccessStatus, string> = {
  inactive: 'Sin acceso',
  invited: 'Invitación pendiente',
  active: 'Portal activo',
};

export const PORTAL_ACCESS_STATUS_VARIANT: Record<
  PortalAccessStatus,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  inactive: 'default',
  invited: 'warning',
  active: 'success',
};

export function buildPortalActivatePath(token: string): string {
  return `/portal/activar?token=${encodeURIComponent(token)}`;
}

/**
 * WhatsApp and some messengers occasionally inject punctuation into long
 * hex tokens. Keep the first 64 hex digits so a mangled link can still open.
 */
export function normalizePortalInviteToken(raw: string | null | undefined): string {
  if (!raw) return '';
  const hex = raw.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  return hex.length >= 64 ? hex.slice(0, 64) : hex;
}
