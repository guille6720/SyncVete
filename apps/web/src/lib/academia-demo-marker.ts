/**
 * Explicit Academia Demo organization marker.
 * Must match organizations.settings written by supabase/ops/academia_demo seed.
 * Never detect demo mode by organization name alone.
 */
export const ACADEMIA_DEMO_KEY = 'sv-academia-demo-v1' as const;

export type AcademiaDemoSettings = {
  academia_demo?: boolean | string | null;
  academia_demo_key?: string | null;
};

export function isAcademiaDemoSettings(
  settings: AcademiaDemoSettings | Record<string, unknown> | null | undefined
): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const raw = settings as AcademiaDemoSettings;
  const enabled =
    raw.academia_demo === true ||
    raw.academia_demo === 'true' ||
    raw.academia_demo === '1';
  return enabled && raw.academia_demo_key === ACADEMIA_DEMO_KEY;
}
