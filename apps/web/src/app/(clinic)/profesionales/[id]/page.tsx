import { notFound, redirect } from 'next/navigation';
import {
  canReadProfessionalCompensation,
  canReadProfessionalSettlements,
  canWriteProfessionalCompensation,
  listCompensationRules,
  listCompensationSchemes,
  listSettlements,
} from '@/actions/professional-settlements';
import {
  canReadProfessionals,
  canWriteProfessionals,
  getProfessional,
  getProfessionalAccessState,
  getProfessionalSettlementSummary,
  listProfessionalBranches,
} from '@/actions/professionals';
import { canManageAppointments, getAssignableStaff } from '@/actions/appointments';
import {
  listProfessionalSchedules,
  listProfessionalTimeBlocks,
} from '@/actions/appointment-availability';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { canReadAudit } from '@/actions/audit';
import { getSessionContext } from '@/lib/session';
import { hasPermission, parseOrganizationSettings, formatDateParam } from '@sincvete/shared';
import { ProfessionalProfileClient } from '@/components/professionals/professional-profile-client';
import { ProfessionalHistoryPanel } from '@/components/professionals/professional-history-panel';
import type { ProfessionalProfileTab } from '@/components/professionals/professional-profile-tabs';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROFILE_TABS: ProfessionalProfileTab[] = [
  'resumen',
  'datos',
  'agenda',
  'honorarios',
  'liquidaciones',
  'acceso',
  'historial',
];

export default async function ProfesionalDetailPage({ params, searchParams }: PageProps) {
  const canRead = await canReadProfessionals();
  if (!canRead) redirect('/dashboard');

  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();

  const professional = await getProfessional(id);
  if (!professional) notFound();

  const today = formatDateParam(new Date());
  const [year, month, day] = today.split('-').map(Number);
  const toDate = new Date(Date.UTC(year, month - 1, day + 60, 12));
  const to = toDate.toISOString().slice(0, 10);

  const [
    session,
    branches,
    professionalBranches,
    staff,
    canWrite,
    canReadComp,
    canWriteComp,
    canReadSettlements,
    canWriteAppointments,
    canAudit,
    organization,
    settlementSummary,
    access,
  ] = await Promise.all([
    getSessionContext(),
    getUserBranches(),
    listProfessionalBranches(id),
    getAssignableStaff(),
    canWriteProfessionals(),
    canReadProfessionalCompensation(),
    canWriteProfessionalCompensation(),
    canReadProfessionalSettlements(),
    canManageAppointments(),
    canReadAudit(),
    getOrganization(),
    canReadProfessionalSettlements().then((allowed) =>
      allowed ? getProfessionalSettlementSummary(id) : null
    ),
    getProfessionalAccessState(id),
  ]);

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const branchIds = professionalBranches.map((row) => row.branch_id);
  const canManageUsers = Boolean(session && hasPermission(session.permissions, 'users:manage'));

  let schemes: Awaited<ReturnType<typeof listCompensationSchemes>> = [];
  const rulesByScheme: Record<string, Awaited<ReturnType<typeof listCompensationRules>>> = {};

  if (canReadComp) {
    schemes = await listCompensationSchemes(id);
    await Promise.all(
      schemes.map(async (scheme) => {
        rulesByScheme[scheme.id] = await listCompensationRules(scheme.id);
      })
    );
  }

  const [recentSettlements, schedules, blocks] = await Promise.all([
    canReadSettlements
      ? listSettlements({ professionalId: id, page: 1, pageSize: 5 }).then((result) => result.data)
      : Promise.resolve([]),
    professional.user_id
      ? listProfessionalSchedules({ userId: professional.user_id }).catch(() => [])
      : Promise.resolve([]),
    professional.user_id
      ? listProfessionalTimeBlocks({ userId: professional.user_id, from: today, to }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const defaultTab = PROFILE_TABS.includes(query.tab as ProfessionalProfileTab)
    ? (query.tab as ProfessionalProfileTab)
    : 'resumen';

  return (
    <ProfessionalProfileClient
      professional={professional}
      branches={branches}
      branchIds={branchIds}
      staff={staff}
      canWrite={canWrite}
      canReadComp={canReadComp}
      canWriteComp={canWriteComp}
      canReadSettlements={canReadSettlements}
      canManageUsers={canManageUsers}
      canWriteAppointments={canWriteAppointments}
      currency={currency}
      settlementSummary={settlementSummary}
      schemes={schemes}
      rulesByScheme={rulesByScheme}
      recentSettlements={recentSettlements}
      access={
        access ?? {
          userId: null,
          membershipId: null,
          role: null,
          isActive: null,
          email: professional.email,
          fullName: null,
        }
      }
      schedules={schedules}
      blocks={blocks}
      defaultBranchId={session?.branchId}
      defaultTab={defaultTab}
      historySlot={
        <ProfessionalHistoryPanel professionalId={id} canReadAudit={canAudit} />
      }
    />
  );
}
