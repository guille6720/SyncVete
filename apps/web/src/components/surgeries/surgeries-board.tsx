'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { startSurgery } from '@/actions/surgeries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SPECIES_EMOJI,
  SURGERY_STATUS_LABELS,
  SURGERY_STATUS_VARIANT,
  formatClinicalEntryDateTime,
  type SurgeryListRow,
} from '@sincvete/shared';

interface SurgeriesBoardProps {
  items: SurgeryListRow[];
  canWrite: boolean;
}

export function SurgeriesBoard({ items, canWrite }: SurgeriesBoardProps) {
  const inProgress = items.filter((item) => item.status === 'en_curso');
  const recovery = items.filter((item) => item.status === 'recuperacion');
  const scheduled = items.filter((item) => item.status === 'programada');

  return (
    <div className="space-y-6" data-tour="cirugias-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Quirófano</h2>
          <p className="text-sm text-muted-foreground">
            {inProgress.length} en curso · {recovery.length} en recuperación · {scheduled.length}{' '}
            programada{scheduled.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canWrite && (
          <div data-tour="cirugias-new">
            <Button asChild>
              <Link href="/cirugias/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Programar
              </Link>
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No hay cirugías activas ni programadas.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href="/cirugias/nueva">Programar cirugía</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((surgery) => (
            <BoardRow key={surgery.id} surgery={surgery} canWrite={canWrite} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardRow({ surgery, canWrite }: { surgery: SurgeryListRow; canWrite: boolean }) {
  const router = useRouter();

  const handleStart = async () => {
    const result = await startSurgery(surgery.id);
    if (result.success) router.push(`/cirugias/${surgery.id}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <Link href={`/cirugias/${surgery.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {SPECIES_EMOJI[surgery.patient_species]} {surgery.patient_name}
          </p>
          <Badge variant={SURGERY_STATUS_VARIANT[surgery.status]}>
            {SURGERY_STATUS_LABELS[surgery.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm">{surgery.procedure_name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatClinicalEntryDateTime(surgery.scheduled_at)}
          {surgery.surgeon_name ? ` · ${surgery.surgeon_name}` : ''}
        </p>
      </Link>
      {canWrite && surgery.status === 'programada' && (
        <Button size="sm" onClick={handleStart}>
          Iniciar
        </Button>
      )}
    </div>
  );
}
