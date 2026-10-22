'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { withListReturn } from '@/lib/list-return';
import {
  CASH_SESSION_STATUSES,
  CASH_SESSION_STATUS_LABELS,
  CASH_SESSION_STATUS_VARIANT,
  formatClinicalEntryDateTime,
  formatMoney,
  type CashSessionListRow,
  type PaginatedResult,
} from '@sincvete/shared';

interface CashSessionsHistoryProps {
  data: PaginatedResult<CashSessionListRow>;
  initialStatus?: string;
  currency?: string;
  branchName?: string | null;
}

export function CashSessionsHistory({
  data,
  initialStatus = '',
  currency = 'ARS',
  branchName = null,
}: CashSessionsHistoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  const setStatus = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set('status', status);
    else params.delete('status');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Historial de cajas</h2>
          <p className="text-sm text-muted-foreground">
            {branchName
              ? `Aperturas y cierres · ${branchName}`
              : 'Aperturas y cierres de la sucursal de tu sesión'}
          </p>
        </div>
        <Select
          value={initialStatus}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">Todos los estados</option>
          {CASH_SESSION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CASH_SESSION_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {initialStatus
            ? 'No hay turnos de caja con ese filtro en esta sucursal.'
            : 'No hay turnos de caja en el historial de esta sucursal.'}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((session) => (
              <Link
                key={session.id}
                href={withListReturn(`/caja/${session.id}`, searchParams)}
                className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{session.branch_name}</p>
                  <Badge variant={CASH_SESSION_STATUS_VARIANT[session.status]}>
                    {CASH_SESSION_STATUS_LABELS[session.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatClinicalEntryDateTime(session.opened_at)}
                  {session.closed_at
                    ? ` → ${formatClinicalEntryDateTime(session.closed_at)}`
                    : ''}
                  {session.opened_by_name ? ` · ${session.opened_by_name}` : ''}
                  {` · Fondo ${formatMoney(session.opening_amount, currency)}`}
                  {session.expected_cash != null
                    ? ` · Esperado ${formatMoney(session.expected_cash, currency)}`
                    : ''}
                  {session.difference != null
                    ? ` · Dif. ${formatMoney(session.difference, currency)}`
                    : ''}
                </p>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} turno{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
                {data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => goToPage(data.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => goToPage(data.page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
