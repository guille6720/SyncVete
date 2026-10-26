import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Reusable clinic panel — SyncVete tokens only (no MyVete purple). */
export function SurfaceCard({
  children,
  className,
  padding = 'md',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-4 md:p-5',
        padding === 'lg' && 'p-5 md:p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SurfaceCardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center',
        className
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
