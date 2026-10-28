'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cancelInventoryPurchase } from '@/actions/purchases';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  INVENTORY_PURCHASE_STATUS_LABELS,
  INVENTORY_PURCHASE_STATUS_VARIANT,
  INVENTORY_UNIT_LABELS,
  type InventoryPurchaseDetail,
} from '@sincvete/shared';

interface PurchaseDetailProps {
  purchase: InventoryPurchaseDetail;
  canWrite: boolean;
  branchName?: string | null;
  listHref?: string;
}

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString('es-AR');
  } catch {
    return value;
  }
}

export function PurchaseDetail({
  purchase,
  canWrite,
  branchName = null,
  listHref = '/compras',
}: PurchaseDetailProps) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await cancelInventoryPurchase(purchase.id);
      if (!result.success) {
        setError(result.error ?? 'No se pudo anular la compra');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
      setCancelOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={cancelOpen}
        title="Anular compra"
        description="Se descontará del stock la cantidad recibida en esta compra. Solo funciona si hay stock suficiente."
        confirmLabel="Anular"
        variant="destructive"
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          void handleCancel();
        }}
      />
      <ConfirmDialog
        open={Boolean(error)}
        mode="alert"
        title="No se pudo completar"
        description={error ?? ''}
        onClose={() => setError(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={listHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a compras
          </Link>
        </Button>
        {canWrite && purchase.status === 'recibida' && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setCancelOpen(true)}
          >
            Anular compra
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{purchase.supplier_name}</CardTitle>
            <Badge variant={INVENTORY_PURCHASE_STATUS_VARIANT[purchase.status]}>
              {INVENTORY_PURCHASE_STATUS_LABELS[purchase.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(purchase.purchased_at)}
            {purchase.invoice_number ? ` · ${purchase.invoice_number}` : ''}
            {branchName ? ` · ${branchName}` : ''}
            {purchase.received_by_name ? ` · ${purchase.received_by_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {purchase.notes && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{purchase.notes}</p>
          )}

          <div className="divide-y rounded-lg border">
            {purchase.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <Link
                    href={`/inventario/${item.product_id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {item.product_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatQty(item.quantity)} {INVENTORY_UNIT_LABELS[item.product_unit]}
                    {item.lot_number ? ` · lote ${item.lot_number}` : ''}
                    {item.expires_at ? ` · vence ${formatDate(item.expires_at)}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-sm sm:text-right">
                  <p>{formatMoney(item.unit_cost)} c/u</p>
                  <p className="font-medium">{formatMoney(item.line_total)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end border-t pt-3">
            <p className="text-sm">
              Total:{' '}
              <span className="text-base font-semibold">{formatMoney(purchase.total_cost)}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
