'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { dispensePrescription } from '@/actions/pharmacy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import { withListReturn } from '@/lib/list-return';
import {
  PRESCRIPTION_STATUS_LABELS,
  PRESCRIPTION_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  type PrescriptionListRow,
} from '@sincvete/shared';

interface PrescriptionsBoardProps {
  items: PrescriptionListRow[];
  canWrite: boolean;
  listQuery?: string;
}

export function PrescriptionsBoard({
  items,
  canWrite,
  listQuery = '',
}: PrescriptionsBoardProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Recetas activas</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} pendiente{items.length !== 1 ? 's' : ''} de dispensar
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href={withListReturn('/farmacia/nueva', listQuery)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva receta
            </Link>
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No hay recetas activas.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href={withListReturn('/farmacia/nueva', listQuery)}>Prescribir</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((prescription) => (
            <BoardRow
              key={prescription.id}
              prescription={prescription}
              canWrite={canWrite}
              detailHref={withListReturn(`/farmacia/${prescription.id}`, listQuery)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardRow({
  prescription,
  canWrite,
  detailHref,
}: {
  prescription: PrescriptionListRow;
  canWrite: boolean;
  detailHref: string;
}) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const [error, setError] = useState<string | null>(null);

  const handleDispense = () => {
    void runPending(async () => {
      const result = await dispensePrescription(prescription.id);
      if (result.success) router.refresh();
      else setError(result.error ?? 'No se pudo dispensar');
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <ConfirmDialog
        open={Boolean(error)}
        mode="alert"
        title="No se pudo dispensar"
        description={error ?? ''}
        onClose={() => setError(null)}
      />
      <Link href={detailHref} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {SPECIES_EMOJI[prescription.patient_species]} {prescription.patient_name}
          </p>
          <Badge variant={PRESCRIPTION_STATUS_VARIANT[prescription.status]}>
            {PRESCRIPTION_STATUS_LABELS[prescription.status]}
          </Badge>
          {prescription.number && (
            <span className="text-sm text-muted-foreground">{prescription.number}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatClinicalEntryDateTime(prescription.prescribed_at)}
          {prescription.item_count > 0
            ? ` · ${prescription.item_count} medicamento${prescription.item_count !== 1 ? 's' : ''}`
            : ''}
          {prescription.prescribed_by_name ? ` · ${prescription.prescribed_by_name}` : ''}
        </p>
      </Link>
      {canWrite && (
        <Button size="sm" onClick={handleDispense} isPending={pending}>
          {pending ? 'Dispensando...' : 'Dispensar'}
        </Button>
      )}
    </div>
  );
}
