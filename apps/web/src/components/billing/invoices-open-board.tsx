'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatMoney,
  formatClinicalEntryDateTime,
  type InvoiceListRow,
} from '@sincvete/shared';

interface InvoicesOpenBoardProps {
  items: InvoiceListRow[];
  canWrite: boolean;
}

export function InvoicesOpenBoard({ items, canWrite }: InvoicesOpenBoardProps) {
  const totalBalance = items.reduce((sum, item) => sum + item.balance, 0);
  const currency = items[0]?.currency ?? 'ARS';

  return (
    <div className="space-y-6" data-tour="facturacion-open">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cuentas por cobrar</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} factura{items.length !== 1 ? 's' : ''} emitida
            {items.length !== 1 ? 's' : ''} · saldo {formatMoney(totalBalance, currency)}
          </p>
        </div>
        {canWrite && (
          <div data-tour="facturacion-new">
            <Button asChild>
              <Link href="/facturacion/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Nueva factura
              </Link>
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No hay facturas pendientes de cobro.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href="/facturacion/nueva">Crear factura</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((invoice) => (
            <Link
              key={invoice.id}
              href={`/facturacion/${invoice.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/20"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{invoice.number ?? 'Sin número'}</p>
                  <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                    {INVOICE_STATUS_LABELS[invoice.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">
                  {invoice.owner_full_name}
                  {invoice.patient_name
                    ? ` · ${invoice.patient_species ? SPECIES_EMOJI[invoice.patient_species] : ''} ${invoice.patient_name}`
                    : ''}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {invoice.issued_at ? formatClinicalEntryDateTime(invoice.issued_at) : '—'}
                  {' · '}
                  saldo {formatMoney(invoice.balance, invoice.currency)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
