'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { startConsultationFromAppointment } from '@/actions/consultations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  CONSULTATION_STATUS_LABELS,
  CONSULTATION_STATUS_VARIANT,
  formatAppointmentTime,
  SPECIES_EMOJI,
  type ConsultationQueueItem,
} from '@sincvete/shared';

interface ConsultationsQueueProps {
  items: ConsultationQueueItem[];
  canWrite: boolean;
  canReadHistory: boolean;
}

export function ConsultationsQueue({ items, canWrite, canReadHistory }: ConsultationsQueueProps) {
  const pending = items.filter(
    (item) =>
      item.consultation_status !== 'completada' &&
      item.consultation_status !== 'cancelada' &&
      item.appointment_status !== 'completada'
  );
  const completed = items.filter(
    (item) =>
      item.consultation_status === 'completada' || item.appointment_status === 'completada'
  );

  return (
    <div className="space-y-6" data-tour="consultas-queue">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cola de hoy</h2>
          <p className="text-sm text-muted-foreground">
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''} · {completed.length}{' '}
            completada{completed.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canWrite && (
          <div data-tour="consultas-new">
            <Button asChild>
              <Link href="/consultas/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Consulta walk-in
              </Link>
            </Button>
          </div>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center" data-tour="consultas-list">
          <p className="text-muted-foreground">No hay consultas pendientes para hoy.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href="/consultas/nueva">Iniciar walk-in</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2" data-tour="consultas-list">
          {pending.map((item) => (
            <QueueRow
              key={`${item.queue_kind}-${item.appointment_id ?? item.consultation_id}`}
              item={item}
              canWrite={canWrite}
              canReadHistory={canReadHistory}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Completadas hoy</h3>
          {completed.map((item) => (
            <QueueRow
              key={`${item.queue_kind}-${item.appointment_id ?? item.consultation_id}`}
              item={item}
              canWrite={false}
              canReadHistory={canReadHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  canWrite,
  canReadHistory,
}: {
  item: ConsultationQueueItem;
  canWrite: boolean;
  canReadHistory: boolean;
}) {
  const [pending, setPending] = useState(false);

  const handleStart = async () => {
    if (!item.appointment_id) return;
    setPending(true);
    const result = await startConsultationFromAppointment(item.appointment_id);
    setPending(false);
    if (result && !result.success) {
      alert(result.error ?? 'No se pudo iniciar la consulta');
    }
  };

  const href = item.consultation_id ? `/consultas/${item.consultation_id}` : null;
  const isInProgress = item.consultation_status === 'en_curso' || item.consultation_status === 'en_espera';
  const isCompleted = item.consultation_status === 'completada';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {formatAppointmentTime(item.starts_at)} · {SPECIES_EMOJI[item.patient_species]}{' '}
            {item.patient_name}
          </p>
          {item.consultation_status && (
            <Badge variant={CONSULTATION_STATUS_VARIANT[item.consultation_status]}>
              {CONSULTATION_STATUS_LABELS[item.consultation_status]}
            </Badge>
          )}
          {item.queue_kind === 'walkin' && <Badge>Walk-in</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.appointment_type ? APPOINTMENT_TYPE_LABELS[item.appointment_type] : 'Walk-in'}
          {item.title ? ` · ${item.title}` : ''}
          {item.appointment_status && !item.consultation_status
            ? ` · ${APPOINTMENT_STATUS_LABELS[item.appointment_status]}`
            : ''}
        </p>
        <p className="text-sm text-muted-foreground">
          {item.owner_full_name}
          {item.veterinarian_name ? ` · ${item.veterinarian_name}` : ''}
        </p>
      </div>
      <div className="flex gap-2">
        {href && canReadHistory && (isInProgress || isCompleted) && (
          <Button variant={isInProgress ? 'default' : 'outline'} size="sm" asChild>
            <Link href={href}>{isInProgress ? 'Continuar' : 'Ver'}</Link>
          </Button>
        )}
        {!item.consultation_id && item.appointment_id && canWrite && (
          <Button size="sm" isPending={pending} onClick={handleStart}>
            {pending ? 'Iniciando...' : 'Atender'}
          </Button>
        )}
        {!href && item.appointment_id && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/agenda/${item.appointment_id}`}>Cita</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
