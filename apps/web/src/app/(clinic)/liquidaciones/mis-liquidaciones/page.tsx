import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  canReadOwnProfessionalSettlements,
  getMySettlementsSummary,
  listMySettlements,
} from '@/actions/professional-settlements';
import { MySettlementsSummaryPanel } from '@/components/professionals/my-settlements-summary';
import { SettlementsExportButton } from '@/components/professionals/settlements-export-button';
import { getProfessionalForCurrentUser } from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { SettlementsHistory } from '@/components/professionals/settlements-history';
import { SETTLEMENT_STATUSES, parseOrganizationSettings, type SettlementStatus } from '@sincvete/shared';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    pendingReview?: string;
    unpaid?: string;
    paidInMonth?: string;
    periodStart?: string;
    periodEnd?: string;
  }>;
}

export default async function MisLiquidacionesPage({ searchParams }: PageProps) {
  const canReadOwn = await canReadOwnProfessionalSettlements();
  if (!canReadOwn) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const statusParam = params.status?.trim() ?? '';
  const status = SETTLEMENT_STATUSES.includes(statusParam as SettlementStatus)
    ? (statusParam as SettlementStatus)
    : undefined;
  const pendingReview = params.pendingReview === '1';
  const unpaid = params.unpaid === '1';
  const paidInMonth = params.paidInMonth === '1';

  const [professional, history, organization, summary] = await Promise.all([
    getProfessionalForCurrentUser(),
    listMySettlements({
      page,
      pageSize: 25,
      status: pendingReview || unpaid || paidInMonth ? undefined : status,
      pendingReview,
      unpaid,
      paidInMonth,
      periodStart: paidInMonth ? undefined : params.periodStart,
      periodEnd: paidInMonth ? undefined : params.periodEnd,
    }),
    getOrganization(),
    getMySettlementsSummary(),
  ]);

  if (!professional) notFound();

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mis liquidaciones</h1>
          <p className="text-muted-foreground">
            {professional.last_name}, {professional.first_name} · compensación operativa (no nómina legal)
          </p>
        </div>
        <SettlementsExportButton
          scope="mine"
          status={pendingReview || unpaid || paidInMonth ? undefined : status}
          pendingReview={pendingReview}
          unpaid={unpaid}
          paidInMonth={paidInMonth}
          periodStart={paidInMonth ? undefined : params.periodStart}
          periodEnd={paidInMonth ? undefined : params.periodEnd}
        />
      </div>

      {summary ? <MySettlementsSummaryPanel summary={summary} /> : null}

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <SettlementsHistory
          data={history}
          professionals={[professional]}
          initialStatus={pendingReview || unpaid || paidInMonth ? '' : (status ?? '')}
          initialPendingReview={pendingReview}
          initialUnpaid={unpaid}
          initialPaidInMonth={paidInMonth}
          initialPeriodStart={paidInMonth ? '' : (params.periodStart ?? '')}
          initialPeriodEnd={paidInMonth ? '' : (params.periodEnd ?? '')}
          currency={currency}
          readOnly
          detailBasePath="/liquidaciones/mis-liquidaciones"
        />
      </Suspense>
    </div>
  );
}
