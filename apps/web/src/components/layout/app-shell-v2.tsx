'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { signOut } from '@/actions/auth';
import { BranchSelector } from '@/components/layout/branch-selector';
import { ClinicSidebarHubNav } from '@/components/layout/clinic-sidebar-hub-nav';
import { ClinicTopNav } from '@/components/layout/clinic-top-nav';
import { ClinicIdentityPanel } from '@/components/layout/clinic-identity-panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  APP_NAME,
  INVITABLE_ROLES,
  ROLE_LABELS,
  isClinicPathEntitled,
  type Role,
} from '@sincvete/shared';
import { ThemeControls } from '@/components/theme/theme-controls';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { CommandPalette, CommandPaletteTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';

const IDLE_PREFETCH_HREFS = ['/dashboard', '/agenda'] as const;
/** `1` = collapsed (default). `0` = expanded. */
const SIDEBAR_COLLAPSE_KEY = 'syncvete-ui-v2-sidebar-collapsed';

export interface AppShellV2Props {
  children: React.ReactNode;
  userName: string;
  role: Role;
  organizationName?: string | null;
  /** Clinic-uploaded logo URL when available. */
  organizationLogoUrl?: string | null;
  branchName?: string;
  branches?: Array<{ id: string; name: string; is_active: boolean }>;
  activeBranchId?: string | null;
  unreadNotifications?: number;
  isPlatformAdmin?: boolean;
  entitledHrefs?: string[] | null;
  billingBannerSlot?: React.ReactNode;
  showMySettlementsNav?: boolean;
  permissions?: string[];
  academiaEnabled?: boolean;
}

export function AppShellV2({
  children,
  userName,
  role,
  organizationName = null,
  organizationLogoUrl = null,
  branchName,
  branches = [],
  activeBranchId,
  unreadNotifications = 0,
  isPlatformAdmin = false,
  entitledHrefs = null,
  billingBannerSlot = null,
  showMySettlementsNav = false,
  permissions = [],
  academiaEnabled = false,
}: AppShellV2Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Default collapsed so top nav is primary; SSR + first client paint match.
  const [collapsed, setCollapsed] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      if (raw === '0') setCollapsed(false);
      if (raw === '1') setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setPendingHref(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      for (const href of IDLE_PREFETCH_HREFS) {
        if (isClinicPathEntitled(href, entitledHrefs)) {
          router.prefetch(href);
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [router, entitledHrefs]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const isWaitingRoomFullscreen =
    pathname.startsWith('/sala-espera/pantalla') ||
    pathname.startsWith('/sala-espera/kiosco') ||
    pathname.startsWith('/sala-espera/tablero');

  if (isWaitingRoomFullscreen) {
    return <>{children}</>;
  }

  const clinicLabel = organizationName?.trim() || APP_NAME;
  // Mobile drawer always shows full identity; desktop rail respects collapse.
  const sidebarCompact = collapsed && !mobileOpen;

  return (
    <div
      className="flex min-h-dvh min-w-0"
      style={{ background: 'var(--shell-bg)' }}
      data-shell="ui-v2"
    >
      <CommandPalette
        entitledHrefs={entitledHrefs}
        isPlatformAdmin={isPlatformAdmin}
        showMySettlementsNav={showMySettlementsNav}
        academiaEnabled={academiaEnabled}
      />

      {pendingHref ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-muted"
          aria-hidden
        >
          <div className="h-full w-1/3 animate-[nav-progress_1s_ease-in-out_infinite] bg-primary" />
        </div>
      ) : null}

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="clinic-sidebar-nav"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card/95 shadow-sm backdrop-blur transition-[width,transform] duration-200 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCompact ? 'w-[4.5rem]' : 'w-[min(17rem,88vw)] lg:w-64'
        )}
      >
        <div className="relative shrink-0">
          <ClinicIdentityPanel
            organizationName={organizationName}
            branchName={branchName}
            logoUrl={organizationLogoUrl}
            compact={sidebarCompact}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        {!sidebarCompact && branchName && branches.length > 1 ? (
          <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Sucursal</p>
            <BranchSelector branches={branches} activeBranchId={activeBranchId ?? null} />
          </div>
        ) : null}

        <ClinicSidebarHubNav
          entitledHrefs={entitledHrefs}
          showMySettlementsNav={showMySettlementsNav}
          permissions={permissions}
          academiaEnabled={academiaEnabled}
          isPlatformAdmin={isPlatformAdmin}
          pendingHref={pendingHref}
          collapsed={sidebarCompact}
          onNavigate={(href, isActive) => {
            if (!isActive) setPendingHref(href);
            setMobileOpen(false);
          }}
        />

        <div className="mt-auto shrink-0 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('mb-2 hidden w-full lg:inline-flex', sidebarCompact && 'px-0')}
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
            {!sidebarCompact ? <span className="ml-1">Colapsar</span> : null}
          </Button>
          {!sidebarCompact ? (
            <div className="mb-2 px-2">
              <p className="truncate text-sm font-medium text-foreground">{userName}</p>
              {INVITABLE_ROLES.includes(role) ? (
                <p className="truncate text-xs font-medium text-primary">
                  {branchName ? `Usuario de ${branchName}` : 'Usuario de la clínica'}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
            </div>
          ) : null}
          <form action={signOut}>
            <Button
              variant="ghost"
              className={cn(
                'w-full gap-2',
                sidebarCompact ? 'justify-center px-0' : 'justify-start'
              )}
              type="submit"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {!sidebarCompact ? 'Cerrar sesión' : <span className="sr-only">Cerrar sesión</span>}
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-area-top sticky top-0 z-30 flex min-h-14 min-w-0 flex-wrap items-center gap-1.5 border-b border-border bg-card/90 px-2 py-2 backdrop-blur sm:gap-2 sm:px-3 md:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileOpen}
            aria-controls="clinic-sidebar-nav"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden shrink-0 lg:inline-flex"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
            aria-pressed={collapsed}
            aria-controls="clinic-sidebar-nav"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>

          <div className="min-w-0 md:hidden">
            <p className="truncate text-sm font-semibold text-foreground">{clinicLabel}</p>
          </div>

          <ClinicTopNav
            entitledHrefs={entitledHrefs}
            showMySettlementsNav={showMySettlementsNav}
            permissions={permissions}
            academiaEnabled={academiaEnabled}
          />

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            <CommandPaletteTrigger />
            <div className="hidden sm:block lg:hidden">
              <InstallAppButton
                variant="ghost"
                size="icon"
                showIosSteps={false}
                className="shrink-0"
              />
            </div>
            <ThemeControls />
            {branches.length > 1 ? (
              <div className="hidden xl:block">
                <BranchSelector branches={branches} activeBranchId={activeBranchId ?? null} />
              </div>
            ) : null}
            <NotificationBell unreadCount={unreadNotifications} />
          </div>
        </header>

        <main className="safe-area-bottom min-w-0 flex-1 p-3 sm:p-4 md:p-6 lg:p-8">
          {billingBannerSlot}
          {children}
        </main>
      </div>
    </div>
  );
}
