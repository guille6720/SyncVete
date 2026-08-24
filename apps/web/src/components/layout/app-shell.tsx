'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BedDouble,
  BarChart3,
  Calendar,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PawPrint,
  Receipt,
  Scissors,
  Settings,
  Stethoscope,
  Syringe,
  Users,
  X,
  Bell,
  Sparkles,
  MessageCircle,
  Pill,
  Banknote,
  Images,
  Inbox,
  ScrollText,
  Shield,
  Hourglass,
  Briefcase,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { signOut } from '@/actions/auth';
import { BranchSelector } from '@/components/layout/branch-selector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { APP_NAME, ROLE_LABELS, formatMeteredUsage, isClinicPathEntitled, type Role } from '@sincvete/shared';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { ThemeControls } from '@/components/theme/theme-controls';
import { AppUpdateBanner } from '@/components/layout/app-update-banner';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { CommandPalette, CommandPaletteTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';
import type { ClinicCommercialBanner } from '@/lib/entitlements';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Agenda', href: '/agenda', icon: Calendar },
  { label: 'Sala de espera', href: '/sala-espera', icon: Hourglass },
  { label: 'Pacientes', href: '/pacientes', icon: PawPrint },
  { label: 'Propietarios', href: '/propietarios', icon: Users },
  { label: 'Historia clínica', href: '/historia-clinica', icon: ClipboardList },
  { label: 'Imágenes', href: '/imagenes', icon: Images },
  { label: 'Consultas', href: '/consultas', icon: Stethoscope },
  { label: 'Internación', href: '/internacion', icon: BedDouble },
  { label: 'Vacunación', href: '/vacunacion', icon: Syringe },
  { label: 'Cirugías', href: '/cirugias', icon: Scissors },
  { label: 'Laboratorio', href: '/laboratorio', icon: FlaskConical },
  { label: 'Inventario', href: '/inventario', icon: Package },
  { label: 'Farmacia', href: '/farmacia', icon: Pill },
  { label: 'Facturación', href: '/facturacion', icon: Receipt },
  { label: 'Caja', href: '/caja', icon: Banknote },
  { label: 'Profesionales', href: '/profesionales', icon: Briefcase },
  { label: 'Liquidaciones', href: '/liquidaciones', icon: Wallet },
  { label: 'Mis liquidaciones', href: '/liquidaciones/mis-liquidaciones', icon: Wallet },
  { label: 'Reportes', href: '/reportes', icon: BarChart3 },
  { label: 'Auditoría', href: '/auditoria', icon: ScrollText },
  { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
  { label: 'Recordatorios', href: '/recordatorios', icon: Bell },
  { label: 'Notificaciones', href: '/notificaciones', icon: Inbox },
  { label: 'IA clínica', href: '/ia-clinica', icon: Sparkles },
  { label: 'Configuración', href: '/configuracion', icon: Settings },
] as const;

/** Critical clinical modules — prefetch on shell mount for snappier sidebar nav. */
const PREFETCH_HREFS = [
  '/dashboard',
  '/agenda',
  '/sala-espera',
  '/pacientes',
  '/historia-clinica',
  '/consultas',
  '/farmacia',
] as const;

function quotaUsageText(banner: ClinicCommercialBanner): string {
  if (banner.quotaUsed == null || banner.quotaLimit == null) return '';
  return ` (${formatMeteredUsage({
    featureKey: banner.quotaFeatureKey ?? '',
    label: banner.quotaLabel ?? '',
    used: banner.quotaUsed,
    limit: banner.quotaLimit,
  })})`;
}

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
  billingBanner?: ClinicCommercialBanner | null;
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
  billingBanner = null,
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
    for (const href of PREFETCH_HREFS) {
      if (isClinicPathEntitled(href, entitledHrefs)) {
        router.prefetch(href);
      }
    }
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
      <CommandPalette entitledHrefs={entitledHrefs} isPlatformAdmin={isPlatformAdmin} />

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

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.filter((item) => {
            if (item.href === '/liquidaciones/mis-liquidaciones' && !showMySettlementsNav) {
              return false;
            }
            return isClinicPathEntitled(item.href, entitledHrefs);
          }).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isPending = pendingHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                onClick={() => {
                  if (!isActive) setPendingHref(item.href);
                  setSidebarOpen(false);
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-busy={isPending || undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--clinic)] text-white shadow-sm shadow-[color-mix(in_oklab,var(--clinic)_25%,transparent)]'
                    : 'text-[var(--shell-text)] hover:bg-[var(--clinic-soft)] hover:text-[var(--clinic)]',
                  isPending && !isActive && 'bg-[var(--clinic-soft)] text-[var(--clinic)]'
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-md',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--clinic-soft)] text-[var(--clinic)]'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            );
          })}
          {isPlatformAdmin ? (
            <Link
              href="/superadmin"
              prefetch
              onClick={() => setSidebarOpen(false)}
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
          {billingBanner ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
              {billingBanner.kind === 'trial' ? (
                <p>
                  Estás en trial{billingBanner.planName ? ` (${billingBanner.planName})` : ''}.
                  {billingBanner.trialEndsAt
                    ? ` Vence el ${new Date(billingBanner.trialEndsAt).toLocaleDateString('es-AR')}.`
                    : ''}{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Elegí un plan
                  </Link>
                </p>
              ) : billingBanner.kind === 'past_due' ? (
                <p>
                  Hay un pago pendiente{billingBanner.planName ? ` de ${billingBanner.planName}` : ''}. La
                  clínica sigue operativa.{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Actualizar plan
                  </Link>
                </p>
              ) : billingBanner.kind === 'checkout_pending' ? (
                <p>
                  Estamos confirmando tu pago. No inicies otro hasta que se acredite.{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Ver plan
                  </Link>
                </p>
              ) : billingBanner.kind === 'plan_ending' ? (
                <p>
                  Tu plan{billingBanner.planName ? ` ${billingBanner.planName}` : ''} vence
                  {billingBanner.endsAt
                    ? ` el ${new Date(billingBanner.endsAt).toLocaleDateString('es-AR')}`
                    : ' pronto'}
                  . Renovalo para no perder el acceso.{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Renovar plan
                  </Link>
                </p>
              ) : billingBanner.kind === 'addon_ending' ? (
                <p>
                  El extra{billingBanner.addonName ? ` ${billingBanner.addonName}` : ''} vence
                  {billingBanner.endsAt
                    ? ` el ${new Date(billingBanner.endsAt).toLocaleDateString('es-AR')}`
                    : ' pronto'}
                  . Renovalo para no perder el módulo.{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Renovar extra
                  </Link>
                </p>
              ) : billingBanner.kind === 'quota_over' ? (
                <p>
                  Superaste el cupo
                  {billingBanner.quotaLabel ? ` de ${billingBanner.quotaLabel}` : ''}
                  {quotaUsageText(billingBanner)}. Subí de plan o reducí el uso.{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Ver plan
                  </Link>
                </p>
              ) : billingBanner.kind === 'quota_near' ? (
                <p>
                  El cupo
                  {billingBanner.quotaLabel ? ` de ${billingBanner.quotaLabel}` : ''} está cerca del
                  límite
                  {quotaUsageText(billingBanner)}.{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Ver plan
                  </Link>
                </p>
              ) : (
                <p>
                  Tu plan venció{billingBanner.planName ? ` (${billingBanner.planName})` : ''}. Elegí uno
                  para seguir usando los módulos.{' '}
                  <Link href="/configuracion?tab=plan" className="font-medium underline underline-offset-4">
                    Ver planes
                  </Link>
                </p>
              )}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
