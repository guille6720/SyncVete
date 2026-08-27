'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isClinicPathEntitled } from '@sincvete/shared';
import { cn } from '@/lib/utils';
import {
  CLINIC_SIDEBAR_NAV_ITEMS,
  filterClinicSidebarNavItems,
  findActiveSidebarGroupId,
  groupClinicSidebarNavItems,
  isSidebarNavItemActive,
  type ClinicSidebarNavItem,
} from '@/components/layout/clinic-sidebar-nav-catalog';
import type { DashboardNavGroupId } from '@/components/dashboard/dashboard-nav-catalog';

interface ClinicSidebarNavProps {
  entitledHrefs?: string[] | null;
  showMySettlementsNav?: boolean;
  isPlatformAdmin?: boolean;
  pendingHref: string | null;
  onNavigate: (href: string, isActive: boolean) => void;
}

function NavLink({
  item,
  pendingHref,
  onNavigate,
  nested = false,
}: {
  item: ClinicSidebarNavItem;
  pendingHref: string | null;
  onNavigate: (href: string, isActive: boolean) => void;
  nested?: boolean;
}) {
  const pathname = usePathname();
  const isActive = isSidebarNavItemActive(pathname, item.href);
  const isPending = pendingHref === item.href;
  // Light routes may viewport-prefetch; heavy modules only on hover/focus.
  const allowViewportPrefetch = item.href === '/dashboard' || item.href === '/agenda';

  return (
    <Link
      href={item.href}
      prefetch={allowViewportPrefetch}
      onClick={() => onNavigate(item.href, isActive)}
      aria-current={isActive ? 'page' : undefined}
      aria-busy={isPending || undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg text-sm transition-colors',
        nested ? 'px-3 py-1.5' : 'px-3 py-2',
        isActive
          ? 'bg-[var(--clinic)] text-white shadow-sm shadow-[color-mix(in_oklab,var(--clinic)_25%,transparent)]'
          : 'text-[var(--shell-text)] hover:bg-[var(--clinic-soft)] hover:text-[var(--clinic)]',
        isPending && !isActive && 'bg-[var(--clinic-soft)] text-[var(--clinic)]'
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md',
          nested ? 'h-6 w-6' : 'h-7 w-7',
          isActive
            ? 'bg-white/20 text-white'
            : 'bg-[var(--clinic-soft)] text-[var(--clinic)]'
        )}
      >
        <item.icon className={nested ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </span>
      {item.label}
    </Link>
  );
}

export function ClinicSidebarNav({
  entitledHrefs = null,
  showMySettlementsNav = false,
  isPlatformAdmin = false,
  pendingHref,
  onNavigate,
}: ClinicSidebarNavProps) {
  const pathname = usePathname();

  const visible = useMemo(
    () =>
      filterClinicSidebarNavItems(CLINIC_SIDEBAR_NAV_ITEMS, {
        entitledHrefs,
        showMySettlementsNav,
        isEntitled: (href) => isClinicPathEntitled(href, entitledHrefs),
      }),
    [entitledHrefs, showMySettlementsNav]
  );

  const { topLevel, groups } = useMemo(() => groupClinicSidebarNavItems(visible), [visible]);
  const activeGroupId = useMemo(
    () => findActiveSidebarGroupId(pathname, visible),
    [pathname, visible]
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const isGroupOpen = (groupId: DashboardNavGroupId) =>
    // Default open so the sidebar matches the dashboard module layout at a glance.
    openGroups[groupId] ?? true;

  const toggleGroup = (groupId: DashboardNavGroupId) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? true),
    }));
  };

  return (
    <nav className="flex-1 space-y-3 overflow-y-auto p-3" aria-label="Módulos">
      <div className="space-y-1">
        {topLevel.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pendingHref={pendingHref}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {groups.map(({ group, items }) => {
        const open = isGroupOpen(group.id);
        const groupActive = activeGroupId === group.id;

        return (
          <section key={group.id} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={open}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clinic)]',
                groupActive
                  ? 'text-[var(--clinic)]'
                  : 'text-muted-foreground hover:bg-[var(--clinic-soft)] hover:text-[var(--clinic)]'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-md ring-1',
                  group.tone
                )}
              >
                <group.icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate normal-case tracking-normal">{group.label}</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 opacity-70 transition-transform',
                  open && 'rotate-180'
                )}
                aria-hidden
              />
            </button>

            {open ? (
              <div className="space-y-0.5 pl-1">
                {items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pendingHref={pendingHref}
                    onNavigate={onNavigate}
                    nested
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      {isPlatformAdmin ? (
        <Link
          href="/superadmin"
          prefetch={false}
          onClick={() => onNavigate('/superadmin', pathname.startsWith('/superadmin'))}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            pathname.startsWith('/superadmin')
              ? 'bg-[var(--clinic)] text-white shadow-sm'
              : 'text-[var(--shell-text)] hover:bg-[var(--clinic-soft)] hover:text-[var(--clinic)]'
          )}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--clinic-soft)] text-[var(--clinic)]">
            <Shield className="h-4 w-4" />
          </span>
          Superadmin
        </Link>
      ) : null}
    </nav>
  );
}
