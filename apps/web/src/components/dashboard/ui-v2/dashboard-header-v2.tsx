import { ROLE_LABELS, type DashboardContext, type SessionContext } from '@sincvete/shared';
import { UserRound } from 'lucide-react';
import { getClinicGreeting } from '@/lib/ui-v2/clinic-time';
import { SurfaceCard } from '@/components/ui-v2/surface-card';
import styles from './dashboard-header-v2.module.css';

/** Compact day-panel header — greeting + invited-user branch affiliation. */
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
  const branchName = context?.branchName?.trim() || null;
  const clinicName = context?.organizationName?.trim() || null;
  const affiliation = branchName
    ? `Usuario de ${branchName}`
    : clinicName
      ? `Usuario de ${clinicName}`
      : 'Usuario de la clínica';

  return (
    <SurfaceCard padding="sm" className={`bg-card/95 ${styles.identityCard}`}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {greeting}, {firstName}
            </span>
            <span className="text-muted-foreground"> · {roleLabel}</span>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[color:var(--sv-neon-border)] bg-background px-2 py-1 text-xs font-medium text-foreground shadow-[0_0_0_1px_var(--sv-neon-ring),0_0_12px_var(--sv-neon-glow)]">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{affiliation}</span>
            </span>
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
