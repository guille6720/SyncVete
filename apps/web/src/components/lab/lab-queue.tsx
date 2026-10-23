'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { startLabOrder } from '@/actions/lab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LAB_ORDER_STATUS_LABELS,
  LAB_ORDER_STATUS_VARIANT,
  LAB_PRIORITY_LABELS,
  LAB_PRIORITY_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  type LabOrderListRow,
} from '@sincvete/shared';

interface LabQueueProps {
  items: LabOrderListRow[];
  canWrite: boolean;
}

export function LabQueue({ items, canWrite }: LabQueueProps) {
  const requested = items.filter((item) => item.status === 'solicitada');
  const inProgress = items.filter((item) => item.status === 'en_proceso');

  return (
    <div className="space-y-6" data-tour="laboratorio-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cola de laboratorio</h2>
          <p className="text-sm text-muted-foreground">
            {requested.length} solicitada{requested.length !== 1 ? 's' : ''} · {inProgress.length} en
            proceso
          </p>
        </div>
        {canWrite && (
          <div data-tour="laboratorio-new">
            <Button asChild>
              <Link href="/laboratorio/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Nueva orden
              </Link>
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No hay órdenes pendientes.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href="/laboratorio/nueva">Solicitar estudio</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((order) => (
            <QueueRow key={order.id} order={order} canWrite={canWrite} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({ order, canWrite }: { order: LabOrderListRow; canWrite: boolean }) {
  const router = useRouter();

  const handleStart = async () => {
    const result = await startLabOrder(order.id);
    if (result.success) router.push(`/laboratorio/${order.id}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <Link href={`/laboratorio/${order.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {SPECIES_EMOJI[order.patient_species]} {order.patient_name}
          </p>
          <Badge variant={LAB_ORDER_STATUS_VARIANT[order.status]}>
            {LAB_ORDER_STATUS_LABELS[order.status]}
          </Badge>
          <Badge variant={LAB_PRIORITY_VARIANT[order.priority]}>
            {LAB_PRIORITY_LABELS[order.priority]}
          </Badge>
        </div>
        <p className="mt-1 text-sm">{order.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatClinicalEntryDateTime(order.ordered_at)}
          {order.item_count > 0 ? ` · ${order.item_count} estudio${order.item_count !== 1 ? 's' : ''}` : ''}
          {order.ordered_by_name ? ` · ${order.ordered_by_name}` : ''}
        </p>
      </Link>
      {canWrite && order.status === 'solicitada' && (
        <Button size="sm" onClick={handleStart}>
          Iniciar
        </Button>
      )}
    </div>
  );
}
