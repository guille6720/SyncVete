import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  canReadOwnProfessionalSettlements,
  listMySettlements,
} from '@/actions/professional-settlements';
import { getProfessionalForCurrentUser } from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { SettlementsHistory } from '@/components/professionals/settlements-history';
import { SETTLEMENT_STATUSES, parseOrganizationSettings, type SettlementStatus } from '@sincvete/shared';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
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

  const [professional, history, organization] = await Promise.all([
    getProfessionalForCurrentUser(),
    listMySettlements({ page, pageSize: 25, status }),
    getOrganization(),
  ]);

  if (!professional) notFound();

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis liquidaciones</h1>
        <p className="text-muted-foreground">
          {professional.last_name}, {professional.first_name} · compensación operativa (no nómina legal)
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <SettlementsHistory
          data={history}
          professionals={[professional]}
          initialStatus={status ?? ''}
          currency={currency}
          readOnly
          detailBasePath="/liquidaciones/mis-liquidaciones"
        />
      </Suspense>
    </div>
  );
}
