'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APP_NAME } from '@sincvete/shared';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/#producto', label: 'Producto' },
  { href: '/#por-que', label: `Por qué ${APP_NAME}` },
  { href: '/#planes', label: 'Planes' },
  { href: '/#extras', label: 'Extras' },
  { href: '/#faq', label: 'FAQ' },
] as const;

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-[var(--land-line)] bg-[var(--land-bg)]/95 backdrop-blur-md'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandLogo href="/" size="sm" priority />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--land-muted)] transition-colors hover:text-[var(--land-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <InstallAppButton landing />
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--land-ink)]/80 hover:text-[var(--land-ink)]"
          >
            Iniciar sesión
          </Link>
          <Button
            className="rounded-none bg-[var(--land-accent)] px-5 text-white hover:bg-[var(--land-ink)]"
            asChild
          >
            <Link href="/register">Suscribirme</Link>
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center text-[var(--land-ink)] md:hidden"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--land-line)] bg-[var(--land-bg)] px-4 py-5 md:hidden">
          <nav className="flex flex-col gap-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-[var(--land-ink)]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="text-sm" onClick={() => setOpen(false)}>
              Iniciar sesión
            </Link>
            <InstallAppButton landing className="w-full" />
            <Button
              className="mt-1 rounded-none bg-[var(--land-accent)] text-white hover:bg-[var(--land-ink)]"
              asChild
            >
              <Link href="/register" onClick={() => setOpen(false)}>
                Suscribirme
              </Link>
            </Button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
