'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HOSPITALIZATION_STATUS_LABELS,
  HOSPITALIZATION_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatHospitalizationStayDays,
  type HospitalizationListRow,
} from '@sincvete/shared';

interface HospitalizationsBoardProps {
  items: HospitalizationListRow[];
  canWrite: boolean;
}

export function HospitalizationsBoard({ items, canWrite }: HospitalizationsBoardProps) {
  return (
    <div className="space-y-4" data-tour="internacion-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div data-tour="internacion-detail">
          <h2 className="text-lg font-semibold">Internados ahora</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} paciente{items.length !== 1 ? 's' : ''} en internación u observación
          </p>
        </div>
        {canWrite && (
          <div data-tour="internacion-new">
            <Button asChild>
              <Link href="/internacion/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Admitir
              </Link>
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No hay pacientes internados.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href="/internacion/nueva">Admitir paciente</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((stay) => (
            <Link
              key={stay.id}
              href={`/internacion/${stay.id}`}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {SPECIES_EMOJI[stay.patient_species]} {stay.patient_name}
                </p>
                <Badge variant={HOSPITALIZATION_STATUS_VARIANT[stay.status]}>
                  {HOSPITALIZATION_STATUS_LABELS[stay.status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{stay.owner_full_name}</p>
              <p className="mt-2 text-sm">
                {stay.cage ? `Jaula/box ${stay.cage} · ` : ''}
                {formatHospitalizationStayDays(stay.admitted_at)}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{stay.reason}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
