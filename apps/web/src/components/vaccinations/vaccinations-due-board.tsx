'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SPECIES_EMOJI,
  VACCINATION_DUE_STATUS_LABELS,
  VACCINATION_DUE_STATUS_VARIANT,
  formatVaccinationDate,
  type VaccinationDueRow,
} from '@sincvete/shared';

interface VaccinationsDueBoardProps {
  items: VaccinationDueRow[];
  canWrite: boolean;
}

export function VaccinationsDueBoard({ items, canWrite }: VaccinationsDueBoardProps) {
  const overdue = items.filter((item) => item.due_status === 'vencida');
  const dueSoon = items.filter((item) => item.due_status === 'por_vencer');

  return (
    <div className="space-y-6" data-tour="vacunacion-due">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Vencidas y por vencer</h2>
          <p className="text-sm text-muted-foreground">
            {overdue.length} vencida{overdue.length !== 1 ? 's' : ''} · {dueSoon.length} en los
            próximos 30 días
          </p>
        </div>
        {canWrite && (
          <div data-tour="vacunacion-new">
            <Button asChild>
              <Link href="/vacunacion/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Registrar vacuna
              </Link>
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No hay vacunas vencidas ni por vencer.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href="/vacunacion/nueva">Registrar vacuna</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/vacunacion/${item.id}`}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {SPECIES_EMOJI[item.patient_species]} {item.patient_name}
                </p>
                <Badge variant={VACCINATION_DUE_STATUS_VARIANT[item.due_status]}>
                  {VACCINATION_DUE_STATUS_LABELS[item.due_status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm">{item.vaccine_name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.owner_full_name}
                {' · Aplicada '}
                {formatVaccinationDate(item.administered_at)}
                {item.next_due_at ? ` · Refuerzo ${formatVaccinationDate(item.next_due_at)}` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
