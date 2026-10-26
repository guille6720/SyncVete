import Link from 'next/link';
import type { DashboardNavGroup } from '@/components/dashboard/dashboard-nav-catalog';
import type { ClinicSidebarNavItem } from '@/components/layout/clinic-sidebar-nav-catalog';
import { getModuleItemBlurb } from '@/lib/ui-v2/module-hubs';
import { SurfaceCard } from '@/components/ui-v2/surface-card';
import { cn } from '@/lib/utils';

export function ModuleHubView({
  group,
  items,
}: {
  group: DashboardNavGroup;
  items: ClinicSidebarNavItem[];
}) {
  return (
    <div className="mx-auto min-w-0 max-w-[90rem] space-y-5">
      <SurfaceCard padding="sm" className="border-primary/15">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
              group.tone
            )}
          >
            <group.icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {group.label}
            </h1>
            <p className="text-sm text-muted-foreground">
              Elegí una opción para continuar. Solo se muestran módulos disponibles en tu plan.
            </p>
          </div>
        </div>
      </SurfaceCard>

      {items.length === 0 ? (
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">
            No hay opciones disponibles en este módulo con tus permisos actuales.
          </p>
        </SurfaceCard>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SurfaceCard
                padding="sm"
                className="h-full transition-colors hover:border-primary/35 hover:bg-[var(--clinic-soft)]/50"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--clinic-soft)] text-primary">
                    <item.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{getModuleItemBlurb(item.href)}</p>
                  </div>
                </div>
              </SurfaceCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
