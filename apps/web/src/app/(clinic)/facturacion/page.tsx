import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { Banknote } from 'lucide-react';
import {
  canManageBilling,
  canReadBilling,
  listInvoices,
  listOpenInvoices,
} from '@/actions/billing';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { InvoicesOpenBoard } from '@/components/billing/invoices-open-board';
import { InvoicesHistory } from '@/components/billing/invoices-history';
import { Button } from '@/components/ui/button';
import { INVOICE_STATUSES, type InvoiceStatus } from '@sincvete/shared';

interface FacturacionPageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

export default async function FacturacionPage({ searchParams }: FacturacionPageProps) {
  const canRead = await canReadBilling();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const statusParam = params.status?.trim() ?? '';
  const status = INVOICE_STATUSES.includes(statusParam as InvoiceStatus)
    ? (statusParam as InvoiceStatus)
    : undefined;

  const [open, history, canWrite, session, branches] = await Promise.all([
    listOpenInvoices(),
    listInvoices({
      page,
      pageSize: 25,
      search: search || undefined,
      status,
    }),
    canManageBilling(),
    getSessionContext(),
    getUserBranches(),
  ]);

  const branchName =
    branches.find((branch) => branch.id === session?.branchId)?.name ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
          <p className="text-muted-foreground">
            Cuentas por cobrar, emisión y cobros
            {branchName ? ` · ${branchName}` : ''}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/caja">
            <Banknote className="mr-2 h-4 w-4" />
            Caja
          </Link>
        </Button>
      </div>

      <InvoicesOpenBoard items={open} canWrite={canWrite} />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <InvoicesHistory
          data={history}
          initialSearch={search}
          initialStatus={status ?? ''}
          branchName={branchName}
        />
      </Suspense>
    </div>
  );
}
