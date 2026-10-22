import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSessionContext } from '@/actions/auth';
import { getOpenCashSession } from '@/actions/cash';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { listProfessionalsWithSummary } from '@/actions/professionals';
import {
  canApproveProfessionalSettlements,
  canPayProfessionalSettlements,
  canReadProfessionalSettlements,
  canWriteProfessionalCompensation,
  getSettlementsSummary,
  listSettlements,
} from '@/actions/professional-settlements';
import { SettlementCalculateForm } from '@/components/professionals/settlement-calculate-form';
import { SettlementsHistory } from '@/components/professionals/settlements-history';
import { SettlementsSummaryPanel } from '@/components/professionals/settlements-summary';
import { SettlementsExportButton } from '@/components/professionals/settlements-export-button';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
import { SETTLEMENT_STATUSES, parseOrganizationSettings, type SettlementStatus } from '@sincvete/shared';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    pendingReview?: string;
    unpaid?: string;
    paidInMonth?: string;
    professionalId?: string;
    periodStart?: string;
    periodEnd?: string;
    branchId?: string;
  }>;
}

export default async function LiquidacionesPage({ searchParams }: PageProps) {
  const canRead = await canReadProfessionalSettlements();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const statusParam = params.status?.trim() ?? '';
  const status = SETTLEMENT_STATUSES.includes(statusParam as SettlementStatus)
    ? (statusParam as SettlementStatus)
    : undefined;
  const pendingReview = params.pendingReview === '1';
  const unpaid = params.unpaid === '1';
  const paidInMonth = params.paidInMonth === '1';

  const session = await getSessionContext();
  const [
    professionalsWithSummary,
    history,
    canCalculate,
    canApprove,
    canPay,
    branches,
    organization,
    summary,
    canCash,
  ] = await Promise.all([
    listProfessionalsWithSummary(),
    listSettlements({
      page,
      pageSize: 25,
      status: pendingReview || unpaid || paidInMonth ? undefined : status,
      pendingReview,
      unpaid,
      paidInMonth,
      professionalId: params.professionalId,
      periodStart: paidInMonth ? undefined : params.periodStart,
      periodEnd: paidInMonth ? undefined : params.periodEnd,
      branchId: params.branchId,
    }),
    canWriteProfessionalCompensation(),
    canApproveProfessionalSettlements(),
    canPayProfessionalSettlements(),
    getUserBranches(),
    getOrganization(),
    getSettlementsSummary(),
    canPermissionAndFeature('billing:write', FEATURES.CASH_REGISTER),
  ]);

  const activeProfessionals = professionalsWithSummary.filter((row) => row.is_active);
  const allProfessionals = professionalsWithSummary;

  let openCashSessionId: string | null = null;
  if (canCash && canPay) {
    try {
      const openSession = await getOpenCashSession();
      openCashSessionId = openSession?.id ?? null;
    } catch {
      openCashSessionId = null;
    }
  }

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const orgSettings = parseOrganizationSettings(organization?.settings);
  const summaryWithCurrency = { ...summary, currency: summary.currency || currency };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Liquidaciones</h1>
          <p className="text-muted-foreground">
            Cálculo, revisión y pagos de compensación a profesionales
          </p>
        </div>
        <SettlementsExportButton
          professionalId={params.professionalId}
          status={status}
          pendingReview={pendingReview}
          unpaid={unpaid}
          paidInMonth={paidInMonth}
          periodStart={params.periodStart}
          periodEnd={params.periodEnd}
          branchId={params.branchId}
        />
      </div>

      <SettlementsSummaryPanel summary={summaryWithCurrency} />

      {canCalculate && (
        <SettlementCalculateForm
          professionals={activeProfessionals}
          branches={branches}
          defaultBranchId={session?.branchId ?? undefined}
          defaultProfessionalId={params.professionalId}
          periodPreset={orgSettings.settlementPeriodPreset ?? 'month'}
          periodDays={orgSettings.settlementPeriodDays ?? 14}
        />
      )}

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <SettlementsHistory
          data={history}
          professionals={allProfessionals}
          branches={branches}
          initialStatus={pendingReview || unpaid || paidInMonth ? '' : (status ?? '')}
          initialPendingReview={pendingReview}
          initialUnpaid={unpaid}
          initialPaidInMonth={paidInMonth}
          initialProfessionalId={params.professionalId ?? ''}
          initialPeriodStart={paidInMonth ? '' : (params.periodStart ?? '')}
          initialPeriodEnd={paidInMonth ? '' : (params.periodEnd ?? '')}
          initialBranchId={params.branchId ?? ''}
          currency={currency}
          canBulkApprove={canApprove}
          canBulkSubmit={canCalculate}
          canBulkPay={canPay}
          openCashSessionId={openCashSessionId}
          canPostCashEgreso={Boolean(canCash)}
        />
      </Suspense>
    </div>
  );
}
