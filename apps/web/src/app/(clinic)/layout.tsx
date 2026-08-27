import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { countUnreadNotifications } from '@/actions/notifications';
import { getUserBranches } from '@/actions/settings';
import { AppShell } from '@/components/layout/app-shell';
import { EntitlementRouteGate } from '@/components/entitlements/entitlement-route-gate';
import { ClinicBillingBannerSlot } from '@/components/entitlements/clinic-billing-banner-slot';
import { getClinicEntitledHrefs } from '@/lib/entitlements';
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

  // Critical path only: session shell + entitled hrefs for nav gating.
  // Commercial banner (checkout/meters) streams separately and must not block modules.
  const [branches, unreadNotifications, entitledHrefs, showMySettlementsNav] = await Promise.all([
    getUserBranches(),
    countUnreadNotifications(),
    getClinicEntitledHrefs(session.organizationId),
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
      entitledHrefs={entitledHrefs}
      showMySettlementsNav={showMySettlementsNav}
      billingBannerSlot={
        <Suspense fallback={null}>
          <ClinicBillingBannerSlot organizationId={session.organizationId} />
        </Suspense>
      }
    >
      <EntitlementRouteGate entitledHrefs={entitledHrefs}>{children}</EntitlementRouteGate>
    </AppShell>
  );
}
