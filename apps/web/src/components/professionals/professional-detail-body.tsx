import { Suspense } from 'react';
import {
  canReadProfessionalCompensation,
  canReadProfessionalSettlements,
  canWriteProfessionalCompensation,
  listCompensationRules,
  listCompensationSchemes,
  listSettlements,
} from '@/actions/professional-settlements';
import {
  canWriteProfessionals,
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
import type { Professional } from '@sincvete/shared';
import { ProfessionalProfileClient } from '@/components/professionals/professional-profile-client';
import { ProfessionalHistoryPanel } from '@/components/professionals/professional-history-panel';
import type { ProfessionalProfileTab } from '@/components/professionals/professional-profile-tabs';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { svPerfOperation } from '@/lib/perf/nav-timing';
import { PermissionError } from '@/lib/permissions';
import { isPlanRestrictionError } from '@/lib/entitlements';

const ROUTE = '/profesionales/[id]';

function isMissingSchemaError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : error instanceof Error
        ? error.message
        : String(error ?? '');
  return /schema cache|does not exist|Could not find the (table|function|column)|relation .* does not exist/i.test(
    message
  );
}

function logOptionalFailure(operation: string, error: unknown): void {
  if (error instanceof PermissionError || isPlanRestrictionError(error)) return;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[profesionales.detail] optional ${operation} failed:`, message);
}

async function safeOptional<T>(operation: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await svPerfOperation(ROUTE, operation, fn);
  } catch (error) {
    logOptionalFailure(operation, error);
    if (error instanceof PermissionError || isPlanRestrictionError(error) || isMissingSchemaError(error)) {
      return fallback;
    }
    // Non-critical secondary data: degrade to empty UI instead of crashing the route.
    return fallback;
  }
}

interface ProfessionalDetailBodyProps {
  professional: Professional;
  defaultTab: ProfessionalProfileTab;
}

/**
 * Non-critical professional detail payload (settlements, agenda, compensation, staff).
 * Streamed behind Suspense so identity shell paints first.
 */
export async function ProfessionalDetailBody({
  professional,
  defaultTab,
}: ProfessionalDetailBodyProps) {
  const id = professional.id;
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
    access,
  ] = await svPerfOperation(ROUTE, 'parallelMeta', () =>
    Promise.all([
      getSessionContext(),
      safeOptional('getUserBranches', [], () => getUserBranches()),
      safeOptional('listProfessionalBranches', [], () => listProfessionalBranches(id)),
      safeOptional('getAssignableStaff', [], () => getAssignableStaff()),
      canWriteProfessionals(),
      canReadProfessionalCompensation(),
      canWriteProfessionalCompensation(),
      canReadProfessionalSettlements(),
      canManageAppointments(),
      canReadAudit(),
      safeOptional('getOrganization', null, () => getOrganization()),
      safeOptional('getProfessionalAccessState', null, () => getProfessionalAccessState(id)),
    ])
  );

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const branchIds = professionalBranches.map((row) => row.branch_id);
  const canManageUsers = Boolean(session && hasPermission(session.permissions, 'users:manage'));

  const settlementSummary = canReadSettlements
    ? await safeOptional('getProfessionalSettlementSummary', null, () =>
        getProfessionalSettlementSummary(id)
      )
    : null;

  let schemes: Awaited<ReturnType<typeof listCompensationSchemes>> = [];
  const rulesByScheme: Record<string, Awaited<ReturnType<typeof listCompensationRules>>> = {};

  if (canReadComp) {
    schemes = await safeOptional('listCompensationSchemes', [], () => listCompensationSchemes(id));
    await Promise.all(
      schemes.map(async (scheme) => {
        rulesByScheme[scheme.id] = await safeOptional(
          `listCompensationRules.${scheme.id.slice(0, 8)}`,
          [],
          () => listCompensationRules(scheme.id)
        );
      })
    );
  }

  const [recentSettlements, schedules, blocks] = await svPerfOperation(
    ROUTE,
    'parallelSecondary',
    () =>
      Promise.all([
        canReadSettlements
          ? safeOptional('listSettlements', [], async () => {
              const result = await listSettlements({ professionalId: id, page: 1, pageSize: 5 });
              return result.data;
            })
          : Promise.resolve([]),
        professional.user_id
          ? safeOptional('listProfessionalSchedules', [], () =>
              listProfessionalSchedules({ userId: professional.user_id! })
            )
          : Promise.resolve([]),
        professional.user_id
          ? safeOptional('listProfessionalTimeBlocks', [], () =>
              listProfessionalTimeBlocks({ userId: professional.user_id!, from: today, to })
            )
          : Promise.resolve([]),
      ])
  );

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
        <Suspense
          fallback={
            <Card>
              <CardHeader>
                <CardTitle>Historial</CardTitle>
                <CardDescription>Cargando auditoría…</CardDescription>
              </CardHeader>
            </Card>
          }
        >
          <ProfessionalHistoryPanel professionalId={id} canReadAudit={canAudit} />
        </Suspense>
      }
    />
  );
}

export function ProfessionalDetailBodyFallback({
  professional,
}: {
  professional: Professional;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {professional.last_name}, {professional.first_name}
        </h1>
        <p className="text-muted-foreground">Cargando perfil…</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border bg-muted/40"
            aria-hidden
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border bg-muted/30" aria-hidden />
    </div>
  );
}
