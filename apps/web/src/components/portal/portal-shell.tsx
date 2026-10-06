'use client';

import Link from 'next/link';
import { OwnerAppMobileNav } from './owner-app-mobile-nav';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { PortalWaitingRoomAlerts } from '@/components/portal/portal-waiting-room-alerts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ownerAppTextColor, type OwnerAppBrand } from '@/lib/owner-app';
import type { CSSProperties } from 'react';
import { OwnerAppBrandMark } from '@/components/portal/owner-app-brand';
import { InstallAppButton } from '@/components/pwa/install-app-button';

interface PortalShellProps {
  showAlerts?: boolean;
  brand?: OwnerAppBrand | null;
  children: React.ReactNode;
  userName: string;
  signOutAction: () => Promise<void>;
}

export function PortalShell({
  children,
  userName,
  signOutAction,
  brand,
  showAlerts = true,
}: PortalShellProps) {
  const pathname = usePathname();

  return (
    <div
      className={
        brand?.enabled
          ? 'flex min-h-dvh flex-col bg-muted/20 pb-20'
          : 'flex min-h-screen flex-col bg-background'
      }
      style={
        brand?.enabled
          ? ({
              '--sv-primary': brand.primaryColor,
              '--color-primary': brand.primaryColor,
              '--color-ring': brand.primaryColor,
              '--color-primary-foreground': ownerAppTextColor(brand.primaryColor),
              '--clinic': brand.primaryColor,
            } as CSSProperties)
          : undefined
      }
    >
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          {brand?.enabled ? (
            <Link href="/portal">
              <OwnerAppBrandMark brand={brand} />
            </Link>
          ) : (
            <BrandLogo href="/portal" size="sm" />
          )}
          <nav className="flex flex-wrap items-center gap-2">
            {!brand?.enabled && (
              <>
                <Link
                  href="/portal"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm',
                    pathname === '/portal'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  Inicio
                </Link>
                <Link
                  href="/portal/sala-espera"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm',
                    pathname.startsWith('/portal/sala-espera')
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  Sala de espera
                </Link>
              </>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
            <form action={signOutAction}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="h-4 w-4" />
                Salir
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
        {brand?.enabled && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{brand.welcomeText}</p>
            <InstallAppButton appName={brand.appName} />
          </div>
        )}
        {showAlerts && <PortalWaitingRoomAlerts />}
        {children}
      </main>
      {brand?.enabled && <OwnerAppMobileNav />}
      {brand?.enabled && (
        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
          Hecho por OpusOrg
        </footer>
      )}
    </div>
  );
}
