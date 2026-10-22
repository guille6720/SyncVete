'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PawPrint, HeartPulse, CalendarDays, Bell } from 'lucide-react';
import { ownerAppNeonIcon, type OwnerAppNeonTone } from './owner-app-neon';
import { cn } from '@/lib/utils';

const NAV_TONES: OwnerAppNeonTone[] = ['emerald', 'violet', 'rose', 'cyan', 'amber'];

export function OwnerAppMobileNav() {
  const pathname = usePathname();
  const items = [
    { href: '/portal', label: 'Inicio', Icon: Home, tone: NAV_TONES[0] },
    { href: '/portal/mascotas', label: 'Mascotas', Icon: PawPrint, tone: NAV_TONES[1] },
    { href: '/portal/salud', label: 'Salud', Icon: HeartPulse, tone: NAV_TONES[2] },
    { href: '/portal/turnos', label: 'Turnos', Icon: CalendarDays, tone: NAV_TONES[3] },
    { href: '/portal/avisos', label: 'Avisos', Icon: Bell, tone: NAV_TONES[4] },
  ] as const;
  return (
    <nav
      aria-label="App del tutor"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-300/50 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(16,185,129,0.12)] backdrop-blur dark:border-emerald-400/30 dark:shadow-[0_-4px_22px_rgba(52,211,153,0.2)]"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, label, Icon, tone }) => {
          const active = href === '/portal' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] transition',
                active ? cn('font-semibold', ownerAppNeonIcon(tone)) : 'text-muted-foreground'
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
