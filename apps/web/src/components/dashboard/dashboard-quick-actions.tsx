'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { ChevronDown, LayoutGrid, X, Zap } from 'lucide-react';
import { isClinicPathEntitled } from '@sincvete/shared';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DEFAULT_QUICK_ACTION_IDS,
  DASHBOARD_NAV_ACTIONS,
  filterDashboardNavActions,
  groupVisibleActions,
  resolveQuickActions,
  type DashboardNavAction,
  type DashboardNavActionId,
  type DashboardNavGroup,
} from '@/components/dashboard/dashboard-nav-catalog';

interface DashboardQuickActionsProps {
  canWritePatients: boolean;
  entitledHrefs?: string[] | null;
  /** Override default quick action IDs (future: user prefs). */
  quickActionIds?: readonly DashboardNavActionId[];
}

function ActionPill({ action }: { action: DashboardNavAction }) {
  return (
    <Link
      href={action.href}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
        action.tone
      )}
    >
      <action.icon className="h-4 w-4 shrink-0" />
      {action.label}
    </Link>
  );
}

function GroupDropdown({
  group,
  actions,
}: {
  group: DashboardNavGroup;
  actions: DashboardNavAction[];
}) {
  if (actions.length === 1) {
    return <ActionPill action={actions[0]!} />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            group.tone
          )}
        >
          <group.icon className="h-4 w-4 shrink-0" />
          {group.label}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {actions.map((action) => (
          <DropdownMenuItem key={action.id} asChild>
            <Link href={action.href} className="flex w-full items-center gap-2">
              <action.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{action.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileModulesMenu({
  groups,
}: {
  groups: Array<{ group: DashboardNavGroup; actions: DashboardNavAction[] }>;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium ring-1 transition-colors',
            'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80',
            'dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-800 dark:hover:bg-teal-900/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          Ver todos los módulos
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-border bg-card p-4 text-card-foreground shadow-lg',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl'
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Módulos</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Accesos agrupados por área
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="space-y-4 pb-2">
            {groups.map(({ group, actions }) => (
              <section key={group.id} className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <group.icon className="h-3.5 w-3.5" />
                  {group.label}
                </h3>
                <div className="flex flex-col gap-1">
                  {actions.map((action) => (
                    <Dialog.Close asChild key={action.id}>
                      <Link
                        href={action.href}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <action.icon className="h-4 w-4 text-muted-foreground" />
                        {action.label}
                      </Link>
                    </Dialog.Close>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DashboardQuickActions({
  canWritePatients,
  entitledHrefs = null,
  quickActionIds = DEFAULT_QUICK_ACTION_IDS,
}: DashboardQuickActionsProps) {
  const isEntitled = (href: string) => isClinicPathEntitled(href, entitledHrefs);

  const visibleActions = filterDashboardNavActions(DASHBOARD_NAV_ACTIONS, {
    canWritePatients,
    entitledHrefs,
    isEntitled,
  });

  const quickActions = filterDashboardNavActions(resolveQuickActions(quickActionIds), {
    canWritePatients,
    entitledHrefs,
    isEntitled,
  });

  const grouped = groupVisibleActions(visibleActions);

  return (
    <section className="space-y-4 rounded-xl border border-teal-200/70 bg-card/95 p-5 text-card-foreground shadow-sm backdrop-blur-sm dark:border-teal-800">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200">
          <Zap className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">Acciones rápidas</h2>
          <p className="text-sm text-muted-foreground">Operaciones frecuentes en 1 clic</p>
        </div>
      </div>

      {quickActions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <ActionPill key={action.id} action={action} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay acciones rápidas disponibles con tu plan o permisos actuales.
        </p>
      )}

      <div className="border-t border-border/70 pt-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Módulos</h3>
          <p className="text-xs text-muted-foreground">Abrí cada grupo para ver las acciones</p>
        </div>

        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay módulos disponibles.</p>
        ) : (
          <>
            {/* Always show group triggers (desktop + mobile) */}
            <div className="flex flex-wrap gap-2">
              {grouped.map(({ group, actions }) => (
                <GroupDropdown key={group.id} group={group} actions={actions} />
              ))}
            </div>
            <div className="mt-3 md:hidden">
              <MobileModulesMenu groups={grouped} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
