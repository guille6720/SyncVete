'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CashMovementsList } from '@/components/cash/cash-till';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CASH_SESSION_STATUS_LABELS,
  CASH_SESSION_STATUS_VARIANT,
  PAYMENT_METHOD_LABELS,
  computeExpectedCash,
  formatClinicalEntryDateTime,
  formatMoney,
  sumMovementsByMethod,
  type CashMovementListRow,
  type CashSessionListRow,
} from '@sincvete/shared';

interface CashSessionDetailProps {
  session: CashSessionListRow;
  movements: CashMovementListRow[];
  currency?: string;
  listHref?: string;
}

export function CashSessionDetail({
  session,
  movements,
  currency = 'ARS',
  listHref = '/caja',
}: CashSessionDetailProps) {
  const expected =
    session.expected_cash ?? computeExpectedCash(session.opening_amount, movements);
  const byMethod = sumMovementsByMethod(movements);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a caja
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{session.branch_name}</CardTitle>
            <Badge variant={CASH_SESSION_STATUS_VARIANT[session.status]}>
              {CASH_SESSION_STATUS_LABELS[session.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(session.opened_at)}
            {session.opened_by_name ? ` · ${session.opened_by_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Fondo inicial" value={formatMoney(session.opening_amount, currency)} />
          <DetailField label="Efectivo esperado" value={formatMoney(expected, currency)} />
          <DetailField
            label="Efectivo contado"
            value={
              session.counted_cash != null ? formatMoney(session.counted_cash, currency) : null
            }
          />
          <DetailField
            label="Diferencia"
            value={
              session.difference != null ? formatMoney(session.difference, currency) : null
            }
          />
          <DetailField
            label="Cierre"
            value={
              session.closed_at
                ? `${formatClinicalEntryDateTime(session.closed_at)}${
                    session.closed_by_name ? ` · ${session.closed_by_name}` : ''
                  }`
                : null
            }
          />
          <div className="sm:col-span-2">
            <DetailField label="Notas de apertura" value={session.notes} />
          </div>
          <div className="sm:col-span-2">
            <DetailField label="Notas de cierre" value={session.close_notes} />
          </div>
        </CardContent>
      </Card>

      {byMethod.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cobros e ingresos por medio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {byMethod.map((row) => (
              <div key={row.method} className="rounded-lg border px-3 py-2 text-sm">
                <p className="text-muted-foreground">{PAYMENT_METHOD_LABELS[row.method]}</p>
                <p className="font-medium">
                  {formatMoney(row.amount, currency)} · {row.count}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CashMovementsList movements={movements} currency={currency} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{value || '—'}</div>
    </div>
  );
}
