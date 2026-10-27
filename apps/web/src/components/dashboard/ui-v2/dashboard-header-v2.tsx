import { ROLE_LABELS, type DashboardContext, type SessionContext } from '@sincvete/shared';
import { Building2, Stethoscope, UserRound } from 'lucide-react';
import { getClinicGreeting } from '@/lib/ui-v2/clinic-time';
import { SurfaceCard } from '@/components/ui-v2/surface-card';

/** Invited-user identity card — sits left of Agenda (between sidebar and day ops). */
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
    <SurfaceCard
      padding="md"
      className="h-full bg-card/95"
      aria-label={clinicName ? `Usuario de ${clinicName}` : 'Usuario invitado'}
    >
      <div className="flex h-full min-w-0 flex-col gap-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[color:var(--sv-neon-border)] bg-background text-primary shadow-[0_0_0_1px_var(--sv-neon-ring),0_0_14px_var(--sv-neon-glow)]"
            aria-hidden
          >
            <UserRound className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Usuario invitado
            </p>
            <p className="truncate text-lg font-semibold tracking-tight text-foreground">
              {fullName}
            </p>
            <p className="text-sm text-muted-foreground">
              {greeting} · {roleLabel}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--sv-neon-border)] bg-background/80 px-3 py-3 shadow-[0_0_0_1px_var(--sv-neon-ring),0_0_12px_var(--sv-neon-glow)]">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">
              {clinicName ? `Usuario de ${clinicName}` : 'Usuario de la clínica'}
            </span>
          </p>
          {context?.branchName ? (
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Stethoscope className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">Sucursal {context.branchName}</span>
            </p>
          ) : null}
        </div>

        <p className="mt-auto text-xs text-muted-foreground">
          Sesión activa como {firstName} en el panel de la clínica.
        </p>
      </div>
    </SurfaceCard>
  );
}
