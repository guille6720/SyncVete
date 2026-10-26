import { ROLE_LABELS, type DashboardContext, type SessionContext } from '@sincvete/shared';
import { Building2, Stethoscope } from 'lucide-react';
import { SurfaceCard } from '@/components/ui-v2/surface-card';

export function DashboardHeaderV2({
  session,
  context,
}: {
  session: SessionContext;
  context: DashboardContext | null;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = session.profile.full_name.split(' ')[0];

  return (
    <SurfaceCard
      padding="lg"
      className="overflow-hidden border-primary/15 bg-[linear-gradient(135deg,var(--clinic-soft)_0%,var(--sv-card)_55%)] dark:bg-[linear-gradient(135deg,color-mix(in_oklab,var(--clinic)_18%,transparent)_0%,var(--sv-card)_60%)]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Panel de la clínica
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {greeting}, {firstName}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground md:text-base">
            Rol: {session.role ? ROLE_LABELS[session.role] : 'Portal'}. Resumen del día y accesos
            rápidos a la operación.
          </p>
          {context ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-xs text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {context.organizationName}
              </span>
              {context.branchName ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-xs text-foreground">
                  <Stethoscope className="h-3.5 w-3.5 text-primary" />
                  Sucursal {context.branchName}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </SurfaceCard>
  );
}
