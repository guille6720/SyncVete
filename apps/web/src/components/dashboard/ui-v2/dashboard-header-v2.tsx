import { ROLE_LABELS, type DashboardContext, type SessionContext } from '@sincvete/shared';
import { Building2, Stethoscope } from 'lucide-react';
import { getClinicGreeting } from '@/lib/ui-v2/clinic-time';
import { SurfaceCard } from '@/components/ui-v2/surface-card';

/** Compact day-panel header — clinic identity first, no oversized greeting block. */
export function DashboardHeaderV2({
  session,
  context,
}: {
  session: SessionContext;
  context: DashboardContext | null;
}) {
  const greeting = getClinicGreeting();
  const firstName = session.profile.full_name.split(' ')[0] ?? session.profile.full_name;
  const roleLabel = session.role ? ROLE_LABELS[session.role] : 'Portal';

  return (
    <SurfaceCard padding="sm" className="border-primary/15 bg-card/95">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {greeting}, {firstName}
            </span>
            <span className="text-muted-foreground"> · {roleLabel}</span>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {context?.organizationName ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{context.organizationName}</span>
              </span>
            ) : null}
            {context?.branchName ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                <Stethoscope className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">Sucursal {context.branchName}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
