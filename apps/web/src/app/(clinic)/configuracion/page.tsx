import { redirect } from 'next/navigation';
import { getSessionContext } from '@/actions/auth';
import {
  getOrganizationSettingsForm,
  listBranches,
  listPendingInvitations,
  listTeamMembers,
} from '@/actions/settings';
import { getPlanBillingState, cancelClinicCheckoutIntents } from '@/actions/plan-billing';
import { getSeatUsageMeters } from '@/lib/entitlements';
import { SettingsPageClient } from '@/components/settings/settings-page-client';
import type { SettingsTab } from '@/components/settings/settings-tabs';
import { hasPermission } from '@sincvete/shared';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
import type { Branch, SeatUsageMeter } from '@sincvete/shared';

interface PageProps {
  searchParams: Promise<{ tab?: string; checkout?: string }>;
}

export default async function ConfiguracionPage({ searchParams }: PageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session) redirect('/login');

  const canOrg = hasPermission(session.permissions, 'org:manage');
  const canBranch = hasPermission(session.permissions, 'branch:manage');
  const canUsers = hasPermission(session.permissions, 'users:manage');

  const availableTabs: SettingsTab[] = ['roles', 'legal'];
  if (session.isPlatformAdmin) availableTabs.push('guia-superadmin');
  if (canOrg) availableTabs.unshift('clinica', 'plan');
  if (canBranch) availableTabs.push('sucursales');
  if (canUsers) availableTabs.push('equipo');

  const needBranches = canBranch || canUsers;
  const branchPageSize = canUsers ? 100 : 50;

  const [
    canImportData,
    canExportData,
    showProfessionalsLink,
    clinicResult,
    planBillingInitial,
    seats,
    branchesResult,
    teamParts,
  ] = await Promise.all([
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
    canPermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT),
    canPermissionAndFeature('professionals:read', FEATURES.PROFESSIONALS_SETTLEMENTS),
    canOrg ? getOrganizationSettingsForm() : Promise.resolve(null),
    canOrg
      ? getPlanBillingState().catch(() => undefined)
      : Promise.resolve(undefined),
    canUsers || canBranch
      ? getSeatUsageMeters(session.organizationId).catch(() => [] as SeatUsageMeter[])
      : Promise.resolve([] as SeatUsageMeter[]),
    needBranches
      ? listBranches({ page: 1, pageSize: branchPageSize })
      : Promise.resolve(undefined),
    canUsers
      ? Promise.all([
          listTeamMembers({ page: 1, pageSize: 50 }),
          listPendingInvitations(),
        ])
      : Promise.resolve(null),
  ]);

  if (canImportData || canExportData) availableTabs.push('import-export');

  const requested = params.tab;
  const defaultTab: SettingsTab =
    requested && availableTabs.includes(requested as SettingsTab)
      ? (requested as SettingsTab)
      : availableTabs.includes('clinica')
        ? 'clinica'
        : availableTabs[0];

  let clinicData;
  if (clinicResult?.success && clinicResult.data) {
    clinicData = {
      organizationName: clinicResult.data.organization.name,
      settings: clinicResult.data.settings,
    };
  }

  let planBilling = planBillingInitial;
  if (canOrg && params.checkout === 'cancel') {
    try {
      await cancelClinicCheckoutIntents();
      planBilling = await getPlanBillingState();
    } catch {
      // keep initial plan billing
    }
  }

  let branchesData;
  if (canBranch && branchesResult) {
    branchesData = branchesResult;
  }

  let teamData;
  if (canUsers && teamParts && branchesResult) {
    const [members, invitations] = teamParts;
    teamData = {
      members,
      invitations,
      branches: branchesResult.data as Branch[],
    };
  }

  return (
    <SettingsPageClient
      availableTabs={availableTabs}
      defaultTab={defaultTab}
      canImportData={canImportData}
      canExportData={canExportData}
      clinic={clinicData}
      branches={branchesData}
      team={teamData}
      seats={seats}
      showProfessionalsLink={showProfessionalsLink}
      planBilling={planBilling}
      checkoutBanner={params.checkout ?? null}
    />
  );
}
