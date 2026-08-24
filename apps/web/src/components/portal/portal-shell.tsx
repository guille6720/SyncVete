'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { PortalWaitingRoomAlerts } from '@/components/portal/portal-waiting-room-alerts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PortalShellProps {
  children: React.ReactNode;
  userName: string;
  signOutAction: () => Promise<void>;
}

export function PortalShell({ children, userName, signOutAction }: PortalShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <BrandLogo href="/portal" size="sm" />
          <nav className="flex items-center gap-2">
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
        <PortalWaitingRoomAlerts />
        {children}
      </main>
    </div>
  );
}
