import { ROLE_LABELS, type DashboardContext, type SessionContext } from '@sincvete/shared';
import { Building2, Stethoscope, UserRound } from 'lucide-react';
import { getClinicGreeting } from '@/lib/ui-v2/clinic-time';
import { SurfaceCard } from '@/components/ui-v2/surface-card';

/** Compact day-panel header — invited user identity + clinic affiliation. */
export function DashboardHeaderV2({
  session,
  context,
}: {
  session: SessionContext;
  context: DashboardContext | null;
}) {
  const greeting = getClinicGreeting();
  const fullName = session.profile.full_name.trim() || 'Usuario';
  const firstName = fullName.split(' ')[0] ?? fullName;
  const roleLabel = session.role ? ROLE_LABELS[session.role] : 'Portal';
  const clinicName = context?.organizationName?.trim() || null;

  return (
    <SurfaceCard padding="sm" className="bg-card/95">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--sv-neon-border)] bg-background text-primary shadow-[0_0_0_1px_var(--sv-neon-ring),0_0_12px_var(--sv-neon-glow)]"
          aria-hidden
        >
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {greeting}, {firstName}
            </span>
            <span className="text-muted-foreground"> · {roleLabel}</span>
          </p>
          <p className="truncate text-base font-semibold tracking-tight text-foreground">
            {clinicName ? `Usuario de ${clinicName}` : fullName}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2 pt-0.5">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{fullName}</span>
            </span>
            {clinicName ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{clinicName}</span>
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
