import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  canManageCash,
  canReadCash,
  getOpenCashSession,
  listCashMovements,
  listCashSessions,
} from '@/actions/cash';
import { getSessionContext } from '@/actions/auth';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { CashOpenForm } from '@/components/cash/cash-open-form';
import { CashSessionsHistory } from '@/components/cash/cash-sessions-history';
import { CashTill } from '@/components/cash/cash-till';
import { parseOrganizationSettings, CASH_SESSION_STATUSES, type CashSessionStatus } from '@sincvete/shared';

interface CajaPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function CajaPage({ searchParams }: CajaPageProps) {
  const canRead = await canReadCash();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const statusParam = params.status?.trim() ?? '';
  const status = CASH_SESSION_STATUSES.includes(statusParam as CashSessionStatus)
    ? (statusParam as CashSessionStatus)
    : undefined;

  const [openSession, history, canWrite, session, organization, branches] = await Promise.all([
    getOpenCashSession(),
    listCashSessions({ page, pageSize: 25, status }),
    canManageCash(),
    getSessionContext(),
    getOrganization(),
    getUserBranches(),
  ]);

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const movements = openSession ? await listCashMovements(openSession.id) : [];
  const branchName =
    branches.find((branch) => branch.id === session?.branchId)?.name ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Caja</h1>
        <p className="text-muted-foreground">
          Apertura, cobros del turno y cierre de efectivo
          {branchName ? ` · ${branchName}` : ''}
        </p>
      </div>

      {openSession ? (
        <CashTill
          session={openSession}
          movements={movements}
          canWrite={canWrite}
          currency={currency}
        />
      ) : canWrite ? (
        <CashOpenForm branches={branches} defaultBranchId={session?.branchId} />
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay una caja abierta
          {branchName ? ` en ${branchName}` : ' en esta sucursal'}.
        </div>
      )}

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <CashSessionsHistory
          data={history}
          initialStatus={status ?? ''}
          currency={currency}
          branchName={branchName}
        />
      </Suspense>
    </div>
  );
}
