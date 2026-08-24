import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { countUnreadNotifications } from '@/actions/notifications';
import { getUserBranches } from '@/actions/settings';
import { AppShell } from '@/components/layout/app-shell';
import { EntitlementRouteGate } from '@/components/entitlements/entitlement-route-gate';
import { getClinicCommercialShell } from '@/lib/entitlements';
import { hasLinkedProfessionalProfile } from '@/actions/professionals';

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();

  if (!session) {
    redirect('/login');
  }

  const staffRole = session.role;
  if (session.kind !== 'staff' || !staffRole) {
    redirect(session.kind === 'portal' ? '/portal' : '/login');
  }

  // Session, branches, notifications and entitlements are React.cache'd per request.
  const [branches, unreadNotifications, commercial, showMySettlementsNav] = await Promise.all([
    getUserBranches(),
    countUnreadNotifications(),
    getClinicCommercialShell(session.organizationId),
    hasLinkedProfessionalProfile(),
  ]);

  const branchName =
    branches.find((b) => b.id === session.branchId)?.name ??
    branches.find((b) => b.is_main)?.name ??
    branches[0]?.name;

  return (
    <AppShell
      userName={session.profile.full_name}
      role={staffRole}
      branchName={branchName}
      branches={branches}
      activeBranchId={session.branchId}
      unreadNotifications={unreadNotifications}
      isPlatformAdmin={session.isPlatformAdmin}
      entitledHrefs={commercial.entitledHrefs}
      billingBanner={commercial.banner}
      showMySettlementsNav={showMySettlementsNav}
    >
      <EntitlementRouteGate entitledHrefs={commercial.entitledHrefs}>{children}</EntitlementRouteGate>
    </AppShell>
  );
}
