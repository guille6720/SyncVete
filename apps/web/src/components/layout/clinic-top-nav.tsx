'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { isClinicPathEntitled } from '@sincvete/shared';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  buildClinicTopNav,
  withTopNavActiveState,
} from '@/components/layout/clinic-top-nav-catalog';

interface ClinicTopNavProps {
  entitledHrefs?: string[] | null;
  showMySettlementsNav?: boolean;
  academiaEnabled?: boolean;
  onNavigate?: () => void;
}

function NavLinkButton({
  href,
  label,
  active,
  onNavigate,
  compact,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 items-center rounded-lg text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'px-2' : 'px-2.5',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/80 hover:bg-muted hover:text-foreground'
      )}
    >
      {label}
    </Link>
  );
}

/**
 * Horizontal module shortcuts — each entry opens a hub (or the only child route)
 * in the main panel. No nested sidebar expansion.
 */
export function ClinicTopNav({
  entitledHrefs = null,
  showMySettlementsNav = false,
  academiaEnabled = false,
  onNavigate,
}: ClinicTopNavProps) {
  const pathname = usePathname();
  const menus = withTopNavActiveState(
    buildClinicTopNav({
      entitledHrefs,
      showMySettlementsNav,
      academiaEnabled,
      isEntitled: (href) => isClinicPathEntitled(href, entitledHrefs),
    }),
    pathname
  );

  if (menus.length === 0) return null;

  const primaryCount = 5;
  const primary = menus.slice(0, primaryCount);
  const overflow = menus.slice(primaryCount);

  return (
    <nav
      className="order-last flex w-full min-w-0 basis-full items-center gap-0.5 overflow-x-auto md:order-none md:w-auto md:basis-auto md:flex-1"
      aria-label="Navegación principal"
      data-nav-mode="hub"
    >
      <div className="hidden items-center gap-0.5 xl:flex">
        {menus.map((menu) => (
          <NavLinkButton
            key={menu.id}
            href={menu.href}
            label={menu.label}
            active={menu.active}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="flex items-center gap-0.5 xl:hidden">
        {primary.map((menu) => (
          <NavLinkButton
            key={menu.id}
            href={menu.href}
            label={menu.label}
            active={menu.active}
            onNavigate={onNavigate}
            compact
          />
        ))}

        {overflow.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground/80 hover:bg-muted"
                aria-label="Más módulos de navegación"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
                <span className="hidden lg:inline">Más</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              {overflow.map((menu) => (
                <DropdownMenuItem key={menu.id} asChild>
                  <Link href={menu.href} onClick={onNavigate}>
                    {menu.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </nav>
  );
}
