import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSessionContext } from '@/actions/auth';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { listProfessionals } from '@/actions/professionals';
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
import { SETTLEMENT_STATUSES, parseOrganizationSettings, type SettlementStatus } from '@sincvete/shared';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
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

  const session = await getSessionContext();
  const [activeProfessionals, allProfessionals, history, canCalculate, canApprove, canPay, branches, organization, summary] =
    await Promise.all([
    listProfessionals({ activeOnly: true }),
    listProfessionals(),
    listSettlements({
      page,
      pageSize: 25,
      status,
      professionalId: params.professionalId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      branchId: params.branchId,
    }),
    canWriteProfessionalCompensation(),
    canApproveProfessionalSettlements(),
    canPayProfessionalSettlements(),
    getUserBranches(),
    getOrganization(),
    getSettlementsSummary(),
  ]);

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
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
        />
      )}

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <SettlementsHistory
          data={history}
          professionals={allProfessionals}
          branches={branches}
          initialStatus={status ?? ''}
          initialProfessionalId={params.professionalId ?? ''}
          initialPeriodStart={params.periodStart ?? ''}
          initialPeriodEnd={params.periodEnd ?? ''}
          initialBranchId={params.branchId ?? ''}
          currency={currency}
          canBulkApprove={canApprove}
          canBulkSubmit={canCalculate}
          canBulkPay={canPay}
        />
      </Suspense>
    </div>
  );
}
