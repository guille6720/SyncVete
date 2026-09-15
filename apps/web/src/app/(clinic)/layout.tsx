import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { getUserBranches } from '@/actions/settings';
import { AppShell } from '@/components/layout/app-shell';
import { EntitlementRouteGate } from '@/components/entitlements/entitlement-route-gate';
import { ClinicBillingBannerSlot } from '@/components/entitlements/clinic-billing-banner-slot';
import { ClinicUnreadNotificationsBell } from '@/components/notifications/clinic-unread-notifications-bell';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getClinicEntitledHrefs } from '@/lib/entitlements';
import { hasLinkedProfessionalProfile } from '@/actions/professionals';
import {
  getNavPerfReport,
  isNavPerfEnabled,
  navPerfSetPath,
  navPerfTime,
} from '@/lib/perf/nav-timing';

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  if (isNavPerfEnabled()) {
    const headerStore = await headers();
    const path = headerStore.get('x-sv-pathname') || '';
    navPerfSetPath(path || '(clinic)');
  }

  const session = await getSessionContext();

  if (!session) {
    redirect('/login');
  }

  const staffRole = session.role;
  if (session.kind !== 'staff' || !staffRole) {
    redirect(session.kind === 'portal' ? '/portal' : '/login');
  }

  // Critical path: shell chrome needed before paint.
  // Unread badge + commercial banner stream separately (must not block module nav).
  const [branches, entitledHrefs, showMySettlementsNav] = await navPerfTime(
    'layout.parallelShell',
    async () =>
      Promise.all([
        getUserBranches(),
        getClinicEntitledHrefs(session.organizationId),
        hasLinkedProfessionalProfile(),
      ])
  );

  const branchName =
    branches.find((b) => b.id === session.branchId)?.name ??
    branches.find((b) => b.is_main)?.name ??
    branches[0]?.name;

  const perfReport = getNavPerfReport();

  return (
    <AppShell
      userName={session.profile.full_name}
      role={staffRole}
      branchName={branchName}
      branches={branches}
      activeBranchId={session.branchId}
      isPlatformAdmin={session.isPlatformAdmin}
      entitledHrefs={entitledHrefs}
      showMySettlementsNav={showMySettlementsNav}
      perfReport={perfReport}
      notificationBellSlot={
        <Suspense fallback={<NotificationBell unreadCount={0} />}>
          <ClinicUnreadNotificationsBell />
        </Suspense>
      }
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
