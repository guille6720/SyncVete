import { NAV_FEATURE_BY_HREF, type FeatureKey } from '../constants/features';
import { canUseResolvedFeature, type OrganizationEntitlements } from './resolve';

const ALWAYS_VISIBLE_PREFIXES = ['/configuracion', '/usuarios', '/superadmin'] as const;

export function getNavFeatureKey(href: string): FeatureKey | null {
  if (NAV_FEATURE_BY_HREF[href]) return NAV_FEATURE_BY_HREF[href];
  const base = Object.keys(NAV_FEATURE_BY_HREF).find(
    (key) => href === key || href.startsWith(`${key}/`)
  );
  return base ? NAV_FEATURE_BY_HREF[base] : null;
}

export function getNavHrefForPath(pathname: string): string | null {
  const path = (pathname.split('?')[0] ?? pathname).split('#')[0] ?? pathname;
  if (NAV_FEATURE_BY_HREF[path]) return path;
  return (
    Object.keys(NAV_FEATURE_BY_HREF).find(
      (key) => path === key || path.startsWith(`${key}/`)
    ) ?? null
  );
}

export function getEntitledClinicHrefs(entitlements: OrganizationEntitlements): string[] {
  const hrefs = Object.entries(NAV_FEATURE_BY_HREF)
    .filter(([, featureKey]) => canUseResolvedFeature(entitlements, featureKey))
    .map(([href]) => href);
  if (!hrefs.includes('/configuracion')) hrefs.push('/configuracion');
  if (!hrefs.includes('/usuarios')) hrefs.push('/usuarios');
  return hrefs;
}

/**
 * UX helper for sidebar, command palette and route notices.
 * Unmapped paths stay visible. `null` entitledHrefs = fail-open (show everything).
 */
export function isClinicPathEntitled(
  pathname: string,
  entitledHrefs: string[] | null
): boolean {
  if (entitledHrefs === null) return true;
  if (ALWAYS_VISIBLE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  const navHref = getNavHrefForPath(pathname);
  if (!navHref) return true;
  return entitledHrefs.includes(navHref);
}
