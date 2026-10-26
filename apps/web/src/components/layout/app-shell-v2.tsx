'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { signOut } from '@/actions/auth';
import { BranchSelector } from '@/components/layout/branch-selector';
import { ClinicSidebarNav } from '@/components/layout/clinic-sidebar-nav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { APP_NAME, ROLE_LABELS, isClinicPathEntitled, type Role } from '@sincvete/shared';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { ThemeControls } from '@/components/theme/theme-controls';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { CommandPalette, CommandPaletteTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';

const IDLE_PREFETCH_HREFS = ['/dashboard', '/agenda'] as const;
const SIDEBAR_COLLAPSE_KEY = 'syncvete-ui-v2-sidebar-collapsed';

export interface AppShellV2Props {
  children: React.ReactNode;
  userName: string;
  role: Role;
  organizationName?: string | null;
  branchName?: string;
  branches?: Array<{ id: string; name: string; is_active: boolean }>;
  activeBranchId?: string | null;
  unreadNotifications?: number;
  isPlatformAdmin?: boolean;
  entitledHrefs?: string[] | null;
  billingBannerSlot?: React.ReactNode;
  showMySettlementsNav?: boolean;
  academiaEnabled?: boolean;
}

export function AppShellV2({
  children,
  userName,
  role,
  organizationName = null,
  branchName,
  branches = [],
  activeBranchId,
  unreadNotifications = 0,
  isPlatformAdmin = false,
  entitledHrefs = null,
  billingBannerSlot = null,
  showMySettlementsNav = false,
  academiaEnabled = false,
}: AppShellV2Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1');
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
  const logoSize = collapsed ? 'sm' : 'md';

  return (
    <div className="flex min-h-dvh min-w-0" style={{ background: 'var(--shell-bg)' }}>
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
          'fixed inset-y-0 left-0 z-50 flex w-[min(16rem,85vw)] flex-col border-r border-border bg-card/95 shadow-sm backdrop-blur transition-[width,transform] duration-200 lg:static lg:w-auto lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-[4.5rem]' : 'lg:w-60'
        )}
      >
        <div className="relative shrink-0 border-b border-border px-2 py-2">
          <Link
            href="/dashboard"
            className={cn('block', collapsed ? 'px-0.5' : 'px-1')}
            aria-label={APP_NAME}
          >
            <span className="block dark:hidden">
              <BrandLogo
                size={logoSize}
                variant="onLight"
                priority
                className="mx-auto max-h-11 w-auto object-contain object-center"
              />
            </span>
            <span className="hidden dark:block">
              <BrandLogo
                size={logoSize}
                variant="onDark"
                priority
                className="mx-auto max-h-11 w-auto object-contain object-center"
              />
            </span>
          </Link>
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

        {!collapsed && branchName ? (
          <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Sucursal</p>
            {branches.length > 1 ? (
              <BranchSelector branches={branches} activeBranchId={activeBranchId ?? null} />
            ) : (
              <p className="truncate text-sm font-medium text-foreground">{branchName}</p>
            )}
          </div>
        ) : null}

        <ClinicSidebarNav
          entitledHrefs={entitledHrefs}
          showMySettlementsNav={showMySettlementsNav}
          academiaEnabled={academiaEnabled}
          isPlatformAdmin={isPlatformAdmin}
          pendingHref={pendingHref}
          collapsed={collapsed}
          expandMode="active"
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
            className={cn('mb-2 hidden w-full lg:inline-flex', collapsed && 'px-0')}
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
            {!collapsed ? <span className="ml-1">Colapsar</span> : null}
          </Button>
          {!collapsed ? (
            <div className="mb-2 px-2">
              <p className="truncate text-sm font-medium text-foreground">{userName}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
            </div>
          ) : null}
          <form action={signOut}>
            <Button
              variant="ghost"
              className={cn('w-full gap-2', collapsed ? 'justify-center px-0' : 'justify-start')}
              type="submit"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {!collapsed ? 'Cerrar sesión' : <span className="sr-only">Cerrar sesión</span>}
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-area-top sticky top-0 z-30 flex h-14 min-w-0 items-center gap-1.5 border-b border-border bg-card/90 px-2 backdrop-blur sm:gap-2 sm:px-3 md:px-4">
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

          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate text-sm font-semibold text-foreground">{clinicLabel}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {branchName ? `Sucursal ${branchName}` : 'Operación clínica'}
              {' · '}
              {ROLE_LABELS[role]}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
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
