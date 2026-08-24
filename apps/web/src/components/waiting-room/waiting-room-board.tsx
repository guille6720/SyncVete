'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, CalendarPlus } from 'lucide-react';
import {
  checkInAppointment,
  listWaitingRoom,
  reorderWaitingRoom,
  updateWaitingRoomStatus,
} from '@/actions/waiting-room';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import { useWaitingRoomLive } from '@/hooks/use-waiting-room-live';
import {
  APPOINTMENT_TYPE_LABELS,
  SPECIES_EMOJI,
  WAITING_ROOM_NEXT_ACTION_LABELS,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  WAITING_ROOM_TRANSITIONS,
  formatAppointmentTime,
  type AppointmentListRow,
  type WaitingRoomListRow,
  type WaitingRoomStatus,
} from '@sincvete/shared';

interface WaitingRoomBoardProps {
  entries: WaitingRoomListRow[];
  checkInCandidates: AppointmentListRow[];
  canWrite: boolean;
  todayLabel: string;
}

export function WaitingRoomBoard({
  entries: initialEntries,
  checkInCandidates,
  canWrite,
  todayLabel,
}: WaitingRoomBoardProps) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const refresh = useCallback(async () => {
    try {
      const next = await listWaitingRoom({ date: todayLabel });
      setEntries(next);
      router.refresh();
    } catch (error) {
      console.error('[waiting-room board] refresh failed', error);
    }
  }, [router, todayLabel]);

  useWaitingRoomLive(() => {
    void refresh();
  });

  const active = entries.filter((row) => row.waiting_room_status !== 'completed');
  const completed = entries.filter((row) => row.waiting_room_status === 'completed');

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Cola activa</h2>
          <p className="text-sm text-muted-foreground">
            {todayLabel} · {active.length} en sala
            {completed.length > 0
              ? ` · ${completed.length} completado${completed.length === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>

        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-muted-foreground">Nadie en sala de espera por ahora.</p>
            {canWrite && checkInCandidates.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Podés hacer check-in de las citas de hoy más abajo.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((entry) => (
              <WaitingRoomRow key={entry.waiting_room_entry_id} entry={entry} canWrite={canWrite} />
            ))}
          </div>
        )}
      </section>

      {canWrite && checkInCandidates.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Check-in pendiente</h2>
            <p className="text-sm text-muted-foreground">
              Citas de hoy que todavía no ingresaron a la cola
            </p>
          </div>
          <div className="space-y-2">
            {checkInCandidates.map((appointment) => (
              <CheckInCandidateRow key={appointment.id} appointment={appointment} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Completados hoy</h3>
          {completed.map((entry) => (
            <WaitingRoomRow key={entry.waiting_room_entry_id} entry={entry} canWrite={false} />
          ))}
        </section>
      )}
    </div>
  );
}

function WaitingRoomRow({
  entry,
  canWrite,
}: {
  entry: WaitingRoomListRow;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const nextStatus = WAITING_ROOM_TRANSITIONS[entry.waiting_room_status];
  const nextLabel =
    nextStatus && entry.waiting_room_status !== 'completed'
      ? WAITING_ROOM_NEXT_ACTION_LABELS[
          entry.waiting_room_status as Exclude<WaitingRoomStatus, 'completed'>
        ]
      : null;

  const advance = () => {
    if (!nextStatus) return;
    void runPending(async () => {
      const result = await updateWaitingRoomStatus({
        entryId: entry.waiting_room_entry_id,
        newStatus: nextStatus,
      });
      if (!result.success) {
        alert(result.error ?? 'No se pudo actualizar el estado');
        return;
      }
      router.refresh();
    });
  };

  const bumpPriority = () => {
    void runPending(async () => {
      const result = await reorderWaitingRoom({
        entryId: entry.waiting_room_entry_id,
        priority: entry.priority + 10,
      });
      if (!result.success) {
        alert(result.error ?? 'No se pudo priorizar');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {entry.queue_position != null ? `#${entry.queue_position} · ` : ''}
            {formatAppointmentTime(entry.appointment_starts_at)} ·{' '}
            {SPECIES_EMOJI[entry.patient_species]} {entry.patient_name}
          </p>
          <Badge variant={WAITING_ROOM_STATUS_VARIANT[entry.waiting_room_status]}>
            {WAITING_ROOM_STATUS_LABELS[entry.waiting_room_status]}
          </Badge>
          {entry.priority > 0 && <Badge variant="warning">Prioridad {entry.priority}</Badge>}
          {entry.room ? <Badge>{entry.room}</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {APPOINTMENT_TYPE_LABELS[entry.appointment_type]} · {entry.owner_full_name}
          {entry.assigned_user_name ? ` · ${entry.assigned_user_name}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          Check-in {formatAppointmentTime(entry.checked_in_at)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/agenda/${entry.appointment_id}`}>Cita</Link>
        </Button>
        {canWrite && entry.waiting_room_status !== 'completed' && (
          <>
            <Button variant="outline" size="sm" isPending={pending} onClick={bumpPriority}>
              <ArrowUp className="h-4 w-4" />
              Priorizar
            </Button>
            {nextLabel && nextStatus && (
              <Button size="sm" isPending={pending} onClick={advance}>
                {pending ? 'Guardando...' : nextLabel}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CheckInCandidateRow({ appointment }: { appointment: AppointmentListRow }) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();

  const handleCheckIn = () => {
    void runPending(async () => {
      const result = await checkInAppointment(appointment.id);
      if (!result.success) {
        alert(result.error ?? 'No se pudo hacer check-in');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
      <div>
        <p className="font-medium">
          {formatAppointmentTime(appointment.starts_at)} · {SPECIES_EMOJI[appointment.patient_species]}{' '}
          {appointment.patient_name}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {APPOINTMENT_TYPE_LABELS[appointment.appointment_type]} · {appointment.owner_full_name}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/agenda/${appointment.id}`}>Ver cita</Link>
        </Button>
        <Button size="sm" isPending={pending} onClick={handleCheckIn}>
          <CalendarPlus className="h-4 w-4" />
          {pending ? 'Ingresando...' : 'Check-in'}
        </Button>
      </div>
    </div>
  );
}
