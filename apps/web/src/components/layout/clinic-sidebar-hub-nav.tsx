'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Shield } from 'lucide-react';
import { useMemo } from 'react';
import { isClinicPathEntitled } from '@sincvete/shared';
import { cn } from '@/lib/utils';
import {
  CLINIC_SIDEBAR_NAV_ITEMS,
  filterClinicSidebarNavItems,
  findActiveSidebarGroupId,
  getSidebarGroupDestination,
  groupClinicSidebarNavItems,
  isSidebarNavItemActive,
} from '@/components/layout/clinic-sidebar-nav-catalog';
import {
  getModuleGroupIdFromSlug,
  getModuleHubPath,
} from '@/lib/ui-v2/module-hubs';

interface ClinicSidebarHubNavProps {
  entitledHrefs?: string[] | null;
  showMySettlementsNav?: boolean;
  academiaEnabled?: boolean;
  isPlatformAdmin?: boolean;
  pendingHref: string | null;
  onNavigate: (href: string, isActive: boolean) => void;
  collapsed?: boolean;
}

/**
 * UI V2 sidebar: module groups always open a main-panel hub.
 * No accordion / nested lists in the rail.
 */
export function ClinicSidebarHubNav({
  entitledHrefs = null,
  showMySettlementsNav = false,
  academiaEnabled = false,
  isPlatformAdmin = false,
  pendingHref,
  onNavigate,
  collapsed = false,
}: ClinicSidebarHubNavProps) {
  const pathname = usePathname();

  const visible = useMemo(
    () =>
      filterClinicSidebarNavItems(CLINIC_SIDEBAR_NAV_ITEMS, {
        entitledHrefs,
        showMySettlementsNav,
        academiaEnabled,
        isEntitled: (href) => isClinicPathEntitled(href, entitledHrefs),
      }),
    [entitledHrefs, showMySettlementsNav, academiaEnabled]
  );

  const { topLevel, groups } = useMemo(() => groupClinicSidebarNavItems(visible), [visible]);
  const activeGroupId = useMemo(
    () =>
      findActiveSidebarGroupId(pathname, visible, (path) => {
        const match = path.match(/^\/modulos\/([^/]+)/);
        return match?.[1] ? getModuleGroupIdFromSlug(match[1]) : null;
      }),
    [pathname, visible]
  );

  return (
    <nav
      className={cn('flex-1 space-y-2 overflow-y-auto p-2 md:p-3', collapsed && 'space-y-2')}
      aria-label="Módulos"
      data-nav-mode="hub"
    >
      <div className="space-y-1">
        {topLevel.map((item) => {
          const isActive = isSidebarNavItemActive(pathname, item.href);
          const isPending = pendingHref === item.href;
          const allowViewportPrefetch = item.href === '/dashboard' || item.href === '/agenda';

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={allowViewportPrefetch}
              onClick={() => onNavigate(item.href, isActive)}
              aria-current={isActive ? 'page' : undefined}
              aria-busy={isPending || undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-[var(--shell-text)] hover:bg-[var(--clinic-soft)] hover:text-[var(--clinic)]',
                isPending && !isActive && 'bg-[var(--clinic-soft)] text-[var(--clinic)]'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md',
                  isActive
                    ? 'bg-white/20 text-primary-foreground'
                    : 'bg-[var(--clinic-soft)] text-[var(--clinic)]'
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>
              {!collapsed ? item.label : <span className="sr-only">{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {groups.map(({ group, items }) => {
        const href = getSidebarGroupDestination(group.id, items, getModuleHubPath);
        const groupActive = activeGroupId === group.id;
        const isActive =
          groupActive || items.some((item) => isSidebarNavItemActive(pathname, item.href));
        const isPending = pendingHref === href;

        return (
          <Link
            key={group.id}
            href={href}
            title={collapsed ? group.label : undefined}
            onClick={() => onNavigate(href, isActive)}
            aria-current={isActive ? 'page' : undefined}
            aria-busy={isPending || undefined}
            className={cn(
              'flex items-center rounded-lg text-sm transition-colors',
              collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-[var(--shell-text)] hover:bg-[var(--clinic-soft)] hover:text-[var(--clinic)]',
              isPending && !isActive && 'bg-[var(--clinic-soft)] text-[var(--clinic)]'
            )}
          >
            <span
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md ring-1',
                isActive ? 'bg-white/20 text-primary-foreground ring-white/20' : group.tone
              )}
            >
              <group.icon className="h-4 w-4" aria-hidden />
            </span>
            {!collapsed ? (
              <>
                <span className="flex-1 truncate">{group.label}</span>
                {items.length > 1 ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                ) : null}
              </>
            ) : (
              <span className="sr-only">{group.label}</span>
            )}
          </Link>
        );
      })}

      {isPlatformAdmin ? (
        <Link
          href="/superadmin"
          prefetch={false}
          title={collapsed ? 'Superadmin' : undefined}
          onClick={() => onNavigate('/superadmin', pathname.startsWith('/superadmin'))}
          className={cn(
            'flex items-center rounded-lg text-sm transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
            pathname.startsWith('/superadmin')
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-[var(--shell-text)] hover:bg-[var(--clinic-soft)] hover:text-[var(--clinic)]'
          )}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--clinic-soft)] text-[var(--clinic)]">
            <Shield className="h-4 w-4" />
          </span>
          {!collapsed ? 'Superadmin' : <span className="sr-only">Superadmin</span>}
        </Link>
      ) : null}
    </nav>
  );
}
