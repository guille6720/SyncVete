import {
  INVITABLE_ROLES,
  ROLE_LABELS,
  type DashboardContext,
  type SessionContext,
} from '@sincvete/shared';
import { Building2, Stethoscope, UserRound } from 'lucide-react';
import { getClinicGreeting } from '@/lib/ui-v2/clinic-time';
import { SurfaceCard } from '@/components/ui-v2/surface-card';
import styles from './dashboard-header-v2.module.css';

function branchChipLabel(branchName: string) {
  return /^sucursal\b/i.test(branchName) ? branchName : `Sucursal ${branchName}`;
}

/** Compact day-panel header — invited users get branch affiliation; owner keeps clinic chips. */
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
  const branchName = context?.branchName?.trim() || null;
  const clinicName = context?.organizationName?.trim() || null;
  const isInvitedUser = Boolean(session.role && INVITABLE_ROLES.includes(session.role));
  const affiliation = branchName
    ? `Usuario de ${branchName}`
    : clinicName
      ? `Usuario de ${clinicName}`
      : 'Usuario de la clínica';

  if (isInvitedUser) {
    return (
      <SurfaceCard
        padding="lg"
        className={`bg-card/95 ${styles.identityCard}`}
        aria-label={affiliation}
      >
        <div className="flex min-w-0 items-start gap-4 md:gap-5">
          <div className={styles.avatar} aria-hidden>
            <UserRound className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className={styles.eyebrow}>
              Usuario invitado · {roleLabel}
            </p>
            <p className="truncate font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {greeting}, {firstName}
            </p>
            <p className="truncate text-base text-muted-foreground md:text-lg">{fullName}</p>
            <p className={`truncate font-display ${styles.affiliation}`}>{affiliation}</p>
          </div>
        </div>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard padding="sm" className="bg-card/95">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {greeting}, {firstName}
            </span>
            <span className="text-muted-foreground"> · {roleLabel}</span>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {clinicName ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{clinicName}</span>
              </span>
            ) : null}
            {branchName ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
                <Stethoscope className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{branchChipLabel(branchName)}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
