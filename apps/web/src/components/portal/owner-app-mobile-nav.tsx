'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PawPrint, HeartPulse, CalendarDays, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OwnerAppMobileNav() {
  const pathname = usePathname();
  const items = [
    { href: '/portal', label: 'Inicio', Icon: Home },
    { href: '/portal/mascotas', label: 'Mascotas', Icon: PawPrint },
    { href: '/portal/salud', label: 'Salud', Icon: HeartPulse },
    { href: '/portal/turnos', label: 'Turnos', Icon: CalendarDays },
    { href: '/portal/avisos', label: 'Avisos', Icon: Bell },
  ];
  return (
    <nav
      aria-label="App del propietario"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, label, Icon }) => {
          const active = href === '/portal' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px]',
                active ? 'font-semibold text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon size={21} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
