'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
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
import { isSidebarNavItemActive } from '@/components/layout/clinic-sidebar-nav-catalog';

interface ClinicTopNavProps {
  entitledHrefs?: string[] | null;
  showMySettlementsNav?: boolean;
  academiaEnabled?: boolean;
  onNavigate?: () => void;
}

function MenuTriggerButton({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/80 hover:bg-muted hover:text-foreground'
      )}
      aria-haspopup="menu"
    >
      {label}
      <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
    </button>
  );
}

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

  // Desktop: all menus. Tablet: first 4 + overflow. (Mobile uses sidebar drawer.)
  const primaryCount = 4;
  const primary = menus.slice(0, primaryCount);
  const overflow = menus.slice(primaryCount);

  return (
    <nav className="hidden min-w-0 items-center gap-0.5 md:flex" aria-label="Navegación principal">
      <div className="hidden items-center gap-0.5 xl:flex">
        {menus.map((menu) =>
          menu.kind === 'link' ? (
            <Link
              key={menu.id}
              href={menu.href}
              onClick={onNavigate}
              aria-current={menu.active ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                menu.active
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/80 hover:bg-muted hover:text-foreground'
              )}
            >
              {menu.label}
            </Link>
          ) : (
            <DropdownMenu key={menu.id}>
              <DropdownMenuTrigger asChild>
                <span>
                  <MenuTriggerButton label={menu.label} active={menu.active} />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[14rem]">
                {menu.items.map((item) => {
                  const active = isSidebarNavItemActive(pathname, item.href);
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className="flex w-full items-center gap-2"
                      >
                        <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        )}
      </div>

      <div className="flex items-center gap-0.5 xl:hidden">
        {primary.map((menu) =>
          menu.kind === 'link' ? (
            <Link
              key={menu.id}
              href={menu.href}
              onClick={onNavigate}
              aria-current={menu.active ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-lg px-2 text-sm font-medium transition-colors',
                menu.active
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/80 hover:bg-muted hover:text-foreground'
              )}
            >
              {menu.label}
            </Link>
          ) : (
            <DropdownMenu key={menu.id}>
              <DropdownMenuTrigger asChild>
                <span>
                  <MenuTriggerButton label={menu.label} active={menu.active} />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[14rem]">
                {menu.items.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className="flex w-full items-center gap-2"
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        )}

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
            <DropdownMenuContent align="end" className="min-w-[16rem]">
              {overflow.map((menu) =>
                menu.kind === 'link' ? (
                  <DropdownMenuItem key={menu.id} asChild>
                    <Link href={menu.href} onClick={onNavigate}>
                      {menu.label}
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <div key={menu.id} className="px-1 py-1">
                    <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {menu.label}
                    </p>
                    {menu.items.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          className="flex w-full items-center gap-2"
                        >
                          <item.icon
                            className="h-4 w-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </div>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </nav>
  );
}
