'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { signOut } from '@/actions/auth';
import { BranchSelector } from '@/components/layout/branch-selector';
import { ClinicSidebarNav } from '@/components/layout/clinic-sidebar-nav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { APP_NAME, ROLE_LABELS, isClinicPathEntitled, type Role } from '@sincvete/shared';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { ThemeControls } from '@/components/theme/theme-controls';
import { AppUpdateBanner } from '@/components/layout/app-update-banner';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { CommandPalette, CommandPaletteTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';

/** Prefer hover/focus Next.js prefetch; avoid mounting a storm of heavy modules. */
const IDLE_PREFETCH_HREFS = ['/dashboard', '/agenda'] as const;

interface AppShellProps {
  children: React.ReactNode;
  userName: string;
  role: Role;
  branchName?: string;
  branches?: Array<{ id: string; name: string; is_active: boolean }>;
  activeBranchId?: string | null;
  unreadNotifications?: number;
  isPlatformAdmin?: boolean;
  entitledHrefs?: string[] | null;
  /** Streamed commercial banner (non-critical). Prefer over blocking layout awaits. */
  billingBannerSlot?: React.ReactNode;
  showMySettlementsNav?: boolean;
}

export function AppShell({
  children,
  userName,
  role,
  branchName,
  branches = [],
  activeBranchId,
  unreadNotifications = 0,
  isPlatformAdmin = false,
  entitledHrefs = null,
  billingBannerSlot = null,
  showMySettlementsNav = false,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
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

  const isWaitingRoomFullscreen =
    pathname.startsWith('/sala-espera/pantalla') ||
    pathname.startsWith('/sala-espera/kiosco') ||
    pathname.startsWith('/sala-espera/tablero');

  if (isWaitingRoomFullscreen) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--shell-bg)' }}>
      <AppUpdateBanner />
      <CommandPalette
        entitledHrefs={entitledHrefs}
        isPlatformAdmin={isPlatformAdmin}
        showMySettlementsNav={showMySettlementsNav}
      />

      {pendingHref ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden"
          style={{ backgroundColor: 'var(--clinic-muted)' }}
          aria-hidden
        >
          <div
            className="h-full w-1/3 animate-[nav-progress_1s_ease-in-out_infinite]"
            style={{ backgroundColor: 'var(--clinic)' }}
          />
        </div>
      ) : null}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r shadow-sm backdrop-blur transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          borderColor: 'var(--shell-border)',
          backgroundColor: 'var(--shell-surface)',
        }}
      >
        <div
          className="relative border-b px-3 pb-2 pt-3"
          style={{
            borderColor: 'var(--shell-border)',
            backgroundColor: 'var(--shell-surface)',
          }}
        >
          <Link
            href="/dashboard"
            className="block w-full"
            aria-label={APP_NAME}
          >
            <span className="block dark:hidden">
              <BrandLogo size="sidebar" variant="onLight" priority className="mx-auto object-contain object-center" />
            </span>
            <span className="hidden dark:block">
              <BrandLogo size="sidebar" variant="onDark" priority className="mx-auto object-contain object-center" />
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {branchName && (
          <div
            className="border-b px-4 py-3"
            style={{
              borderColor: 'var(--shell-border)',
              backgroundColor: 'var(--shell-panel)',
            }}
          >
            <p className="text-xs" style={{ color: 'var(--clinic)' }}>
              Sucursal
            </p>
            {branches.length > 1 ? (
              <BranchSelector branches={branches} activeBranchId={activeBranchId ?? null} />
            ) : (
              <p className="truncate text-sm font-medium">{branchName}</p>
            )}
          </div>
        )}

        <ClinicSidebarNav
          entitledHrefs={entitledHrefs}
          showMySettlementsNav={showMySettlementsNav}
          isPlatformAdmin={isPlatformAdmin}
          pendingHref={pendingHref}
          onNavigate={(href, isActive) => {
            if (!isActive) setPendingHref(href);
            setSidebarOpen(false);
          }}
        />

        <div className="border-t p-3" style={{ borderColor: 'var(--shell-border)' }}>
          <div className="mb-2 px-3">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
          </div>
          <form action={signOut}>
            <Button variant="ghost" className="w-full justify-start gap-2" type="submit">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header
          className="safe-area-top sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:gap-4"
          style={{
            borderColor: 'var(--shell-border)',
            backgroundColor: 'var(--shell-header)',
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <CommandPaletteTrigger />
          <div className="lg:hidden">
            <InstallAppButton variant="ghost" size="icon" showIosSteps={false} className="shrink-0" />
          </div>
          <ThemeControls />
          <div className="ml-auto flex items-center gap-2">
            {branches.length > 1 && (
              <div className="hidden md:block">
                <BranchSelector branches={branches} activeBranchId={activeBranchId ?? null} />
              </div>
            )}
            <NotificationBell unreadCount={unreadNotifications} />
          </div>
        </header>

        <main className="safe-area-bottom flex-1 overflow-x-auto p-4 md:p-6">
          {billingBannerSlot}
          {children}
        </main>
      </div>
    </div>
  );
}
