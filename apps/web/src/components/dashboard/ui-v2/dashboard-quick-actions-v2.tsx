'use client';

import Link from 'next/link';
import { ChevronDown, MoreHorizontal, Zap } from 'lucide-react';
import { isClinicPathEntitled } from '@sincvete/shared';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  filterDashboardNavActions,
  resolveQuickActions,
  type DashboardNavAction,
  type DashboardNavActionId,
} from '@/components/dashboard/dashboard-nav-catalog';
import { SurfaceCard } from '@/components/ui-v2/surface-card';

/** Primary day-ops actions for UI V2 (not a full module catalog). */
const PRIMARY_ACTION_IDS: readonly DashboardNavActionId[] = [
  'new-consultation',
  'new-patient',
  'waiting-room',
  'view-agenda',
];

/** Extra frequent ops collapsed under "Más acciones" (admit once here, not duplicated). */
const MORE_ACTION_IDS: readonly DashboardNavActionId[] = [
  'new-owner',
  'new-prescription',
  'admit-hospitalization',
  'reminders',
  'new-invoice',
  'cash-register',
];

interface DashboardQuickActionsV2Props {
  canWritePatients: boolean;
  entitledHrefs?: string[] | null;
}

function ActionPill({ action }: { action: DashboardNavAction }) {
  return (
    <Link
      href={action.href}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
        action.tone
      )}
    >
      <action.icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{action.label}</span>
    </Link>
  );
}

export function DashboardQuickActionsV2({
  canWritePatients,
  entitledHrefs = null,
}: DashboardQuickActionsV2Props) {
  const isEntitled = (href: string) => isClinicPathEntitled(href, entitledHrefs);

  const filter = {
    canWritePatients,
    entitledHrefs,
    isEntitled,
  };

  const primary = filterDashboardNavActions(resolveQuickActions(PRIMARY_ACTION_IDS), filter);
  const more = filterDashboardNavActions(resolveQuickActions(MORE_ACTION_IDS), filter).filter(
    (action) => !primary.some((p) => p.id === action.id)
  );

  return (
    <SurfaceCard padding="sm" className="border-primary/20">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--clinic-soft)] text-primary">
          <Zap className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Acciones del día</h2>
          <p className="text-xs text-muted-foreground">Operaciones frecuentes</p>
        </div>
      </div>

      {primary.length === 0 && more.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay acciones disponibles con tu plan o permisos actuales.
        </p>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {primary.map((action) => (
            <ActionPill key={action.id} action={action} />
          ))}
          {more.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
                    'bg-secondary text-secondary-foreground ring-border hover:bg-secondary/80',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  aria-label="Más acciones"
                >
                  <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Más acciones</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {more.map((action) => (
                  <DropdownMenuItem key={action.id} asChild>
                    <Link href={action.href} className="flex w-full items-center gap-2">
                      <action.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span>{action.label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      )}
    </SurfaceCard>
  );
}
