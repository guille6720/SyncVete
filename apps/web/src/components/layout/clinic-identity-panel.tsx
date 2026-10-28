'use client';

import Link from 'next/link';
import { APP_NAME } from '@sincvete/shared';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { cn } from '@/lib/utils';

interface ClinicIdentityPanelProps {
  organizationName?: string | null;
  branchName?: string | null;
  /** Clinic-uploaded logo (HTTPS or app-relative). Falls back to SyncVete BrandLogo. */
  logoUrl?: string | null;
  compact?: boolean;
  className?: string;
}

function isSafeClinicLogoUrl(url: string): boolean {
  if (!url || url.includes('\\') || url.startsWith('//')) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Left-rail clinic identity — large mark + name/location.
 * Uses clinic logo when configured; otherwise original SyncVete logo (no crop/distort).
 */
export function ClinicIdentityPanel({
  organizationName = null,
  branchName = null,
  logoUrl = null,
  compact = false,
  className,
}: ClinicIdentityPanelProps) {
  const clinicLabel = organizationName?.trim() || APP_NAME;
  const safeLogo = logoUrl && isSafeClinicLogoUrl(logoUrl) ? logoUrl : null;

  return (
    <div
      className={cn(
        'flex flex-col items-center border-b border-border bg-card/80 text-center',
        compact ? 'gap-1 px-2 py-2' : 'gap-3 px-4 py-5',
        className
      )}
    >
      <Link
        href="/dashboard"
        className={cn('block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', compact ? 'px-0' : 'px-1')}
        aria-label={clinicLabel}
      >
        {safeLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- clinic logos may be arbitrary HTTPS hosts
          <img
            src={safeLogo}
            alt={clinicLabel}
            className={cn(
              'mx-auto w-auto object-contain object-center',
              compact ? 'max-h-10' : 'max-h-36 max-w-full'
            )}
          />
        ) : (
          <>
            <span className="block dark:hidden">
              <BrandLogo
                size={compact ? 'sm' : 'lg'}
                variant="onLight"
                priority
                className={cn(
                  'mx-auto object-contain object-center',
                  compact ? 'max-h-10 w-auto' : 'max-h-36 w-auto'
                )}
              />
            </span>
            <span className="hidden dark:block">
              <BrandLogo
                size={compact ? 'sm' : 'lg'}
                variant="onDark"
                priority
                className={cn(
                  'mx-auto object-contain object-center',
                  compact ? 'max-h-10 w-auto' : 'max-h-36 w-auto'
                )}
              />
            </span>
          </>
        )}
      </Link>

      {!compact ? (
        <div className="min-w-0 space-y-0.5 px-1">
          <p className="truncate text-sm font-semibold text-foreground">{clinicLabel}</p>
          {branchName ? (
            <p className="truncate text-xs text-muted-foreground">Sucursal {branchName}</p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">Operación clínica</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
