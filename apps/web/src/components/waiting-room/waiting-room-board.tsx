'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUp, CalendarPlus, GripVertical, MessageCircle } from 'lucide-react';
import {
  checkInAppointment,
  listWaitingRoom,
  removeWaitingRoomEntry,
  reorderWaitingRoom,
  reorderWaitingRoomQueue,
  updateWaitingRoomStatus,
} from '@/actions/waiting-room';
import { startConsultationFromAppointment } from '@/actions/consultations';
import { WaitingRoomCheckInQrButton } from '@/components/waiting-room/waiting-room-check-in-qr-button';
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
  applyWaitingRoomQueueOrder,
  buildWhatsAppComposePath,
  formatAppointmentTime,
  sortWaitingRoomQueue,
  type AppointmentListRow,
  type WaitingRoomListRow,
  type WaitingRoomStatus,
} from '@sincvete/shared';

interface WaitingRoomBoardProps {
  entries: WaitingRoomListRow[];
  checkInCandidates: AppointmentListRow[];
  canWrite: boolean;
  canSendWhatsApp?: boolean;
  canStartConsultation?: boolean;
  /** Selected day (YYYY-MM-DD). Write actions only apply when it is today. */
  todayLabel: string;
  isToday?: boolean;
}

export function WaitingRoomBoard({
  entries: initialEntries,
  checkInCandidates,
  canWrite,
  canSendWhatsApp = false,
  canStartConsultation = false,
  todayLabel,
  isToday = true,
}: WaitingRoomBoardProps) {
  const router = useRouter();
  const [entries, setEntries] = useState(() => sortWaitingRoomQueue(initialEntries));
  const [reordering, setReordering] = useState(false);
  const canMutate = canWrite && isToday;

  useEffect(() => {
    setEntries(sortWaitingRoomQueue(initialEntries));
  }, [initialEntries]);

  const refresh = useCallback(async () => {
    try {
      const next = await listWaitingRoom({ date: todayLabel });
      setEntries(sortWaitingRoomQueue(next));
      router.refresh();
    } catch (error) {
      console.error('[waiting-room board] refresh failed', error);
    }
  }, [router, todayLabel]);

  useWaitingRoomLive(() => {
    if (reordering) return;
    void refresh();
  });

  const active = useMemo(
    () => entries.filter((row) => row.waiting_room_status !== 'completed'),
    [entries]
  );
  const completed = useMemo(
    () => entries.filter((row) => row.waiting_room_status === 'completed'),
    [entries]
  );
  const sortableIds = useMemo(
    () => active.map((row) => row.waiting_room_entry_id),
    [active]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    if (!canMutate) return;
    const { active: dragActive, over } = event;
    if (!over || dragActive.id === over.id) return;

    const oldIndex = sortableIds.indexOf(String(dragActive.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const nextIds = arrayMove(sortableIds, oldIndex, newIndex);
    const previous = entries;
    setEntries((current) => {
      const nextActive = applyWaitingRoomQueueOrder(
        current.filter((row) => row.waiting_room_status !== 'completed'),
        nextIds
      );
      const nextCompleted = current.filter((row) => row.waiting_room_status === 'completed');
      return [...nextActive, ...nextCompleted];
    });

    setReordering(true);
    void (async () => {
      const result = await reorderWaitingRoomQueue(nextIds);
      setReordering(false);
      if (!result.success) {
        setEntries(previous);
        alert(result.error ?? 'No se pudo reordenar la cola');
        return;
      }
      router.refresh();
    })();
  };

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
            {canMutate && active.length > 1 ? ' · arrastrá para reordenar' : ''}
            {!isToday ? ' · solo lectura (día pasado o futuro)' : ''}
            {reordering ? ' · guardando…' : ''}
          </p>
        </div>

        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-muted-foreground">Nadie en sala de espera por ahora.</p>
            {canMutate && checkInCandidates.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Podés hacer check-in de las citas de hoy más abajo.
              </p>
            )}
          </div>
        ) : canMutate ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {active.map((entry) => (
                  <SortableWaitingRoomRow
                    key={entry.waiting_room_entry_id}
                    entry={entry}
                    canWrite={canWrite}
                    canSendWhatsApp={canSendWhatsApp}
                    canStartConsultation={canStartConsultation}
                    isToday={isToday}
                    sortable
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-2">
            {active.map((entry) => (
              <WaitingRoomRow
                key={entry.waiting_room_entry_id}
                entry={entry}
                canWrite={canWrite}
                canSendWhatsApp={canSendWhatsApp}
                canStartConsultation={false}
                isToday={isToday}
              />
            ))}
          </div>
        )}
      </section>

      {canMutate && checkInCandidates.length > 0 && (
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
          <h3 className="text-sm font-medium text-muted-foreground">
            Completados {isToday ? 'hoy' : 'del día'}
          </h3>
          {completed.map((entry) => (
            <WaitingRoomRow
              key={entry.waiting_room_entry_id}
              entry={entry}
              canWrite={false}
              canSendWhatsApp={canSendWhatsApp}
              canStartConsultation={false}
              isToday={false}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function waitingRoomWhatsAppHref(entry: WaitingRoomListRow, room?: string | null): string {
  return buildWhatsAppComposePath({
    ownerId: entry.owner_id,
    patientId: entry.patient_id,
    appointmentId: entry.appointment_id,
    template: 'sala_espera_llamado',
    room: room?.trim() || entry.room || undefined,
  });
}

function SortableWaitingRoomRow({
  entry,
  canWrite,
  canSendWhatsApp,
  canStartConsultation,
  isToday,
  sortable,
}: {
  entry: WaitingRoomListRow;
  canWrite: boolean;
  canSendWhatsApp: boolean;
  canStartConsultation: boolean;
  isToday: boolean;
  sortable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.waiting_room_entry_id,
    disabled: !sortable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'relative z-10' : undefined}>
      <WaitingRoomRow
        entry={entry}
        canWrite={canWrite}
        canSendWhatsApp={canSendWhatsApp}
        canStartConsultation={canStartConsultation}
        isToday={isToday}
        dragHandle={
          sortable ? (
            <button
              type="button"
              className="mt-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
              aria-label="Reordenar"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : null
        }
      />
    </div>
  );
}

function WaitingRoomRow({
  entry,
  canWrite,
  canSendWhatsApp,
  canStartConsultation,
  isToday,
  dragHandle = null,
}: {
  entry: WaitingRoomListRow;
  canWrite: boolean;
  canSendWhatsApp: boolean;
  canStartConsultation: boolean;
  isToday: boolean;
  dragHandle?: ReactNode;
}) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const [calling, setCalling] = useState(false);
  const [roomDraft, setRoomDraft] = useState(entry.room ?? '');
  const nextStatus = WAITING_ROOM_TRANSITIONS[entry.waiting_room_status];
  const nextLabel =
    nextStatus && entry.waiting_room_status !== 'completed'
      ? WAITING_ROOM_NEXT_ACTION_LABELS[
          entry.waiting_room_status as Exclude<WaitingRoomStatus, 'completed'>
        ]
      : null;
  const showWhatsApp = canSendWhatsApp && entry.waiting_room_status === 'called';
  const actionsEnabled = canWrite && isToday && entry.waiting_room_status !== 'completed';

  const commitAdvance = (room?: string) => {
    if (!nextStatus) return;
    void runPending(async () => {
      const result = await updateWaitingRoomStatus({
        entryId: entry.waiting_room_entry_id,
        newStatus: nextStatus,
        room,
      });
      if (!result.success) {
        alert(result.error ?? 'No se pudo actualizar el estado');
        return;
      }

      setCalling(false);

      if (nextStatus === 'called' && canSendWhatsApp) {
        const notify = window.confirm('¿Avisar al tutor por WhatsApp?');
        if (notify) {
          router.push(waitingRoomWhatsAppHref(entry, room ?? result.data?.room));
          return;
        }
      }

      if (nextStatus === 'in_consultation' && canStartConsultation) {
        const start = window.confirm('¿Abrir la consulta clínica ahora?');
        if (start) {
          const consultation = await startConsultationFromAppointment(entry.appointment_id);
          if (consultation && !consultation.success) {
            alert(consultation.error ?? 'No se pudo iniciar la consulta');
            router.refresh();
          }
          return;
        }
      }

      router.refresh();
    });
  };

  const advance = () => {
    if (!nextStatus) return;
    if (nextStatus === 'called') {
      setRoomDraft(entry.room ?? '');
      setCalling(true);
      return;
    }
    commitAdvance();
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

  const removeFromQueue = (markAusente: boolean) => {
    const message = markAusente
      ? '¿Quitar de la cola y marcar la cita como ausente?'
      : '¿Quitar de la sala de espera sin marcar ausente?';
    if (!window.confirm(message)) return;

    void runPending(async () => {
      const result = await removeWaitingRoomEntry({
        entryId: entry.waiting_room_entry_id,
        markAusente,
      });
      if (!result.success) {
        alert(result.error ?? 'No se pudo quitar de la cola');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-2">
          {dragHandle}
          <div className="min-w-0">
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
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/agenda/${entry.appointment_id}`}>Cita</Link>
          </Button>
          {showWhatsApp && (
            <Button variant="outline" size="sm" asChild>
              <Link href={waitingRoomWhatsAppHref(entry)}>
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Link>
            </Button>
          )}
          {actionsEnabled && (
            <>
              <Button variant="outline" size="sm" isPending={pending} onClick={bumpPriority}>
                <ArrowUp className="h-4 w-4" />
                Priorizar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isPending={pending}
                onClick={() => removeFromQueue(false)}
              >
                Quitar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isPending={pending}
                onClick={() => removeFromQueue(true)}
              >
                Ausente
              </Button>
              {nextLabel && nextStatus && !calling && (
                <Button size="sm" isPending={pending} onClick={advance}>
                  {pending ? 'Guardando...' : nextLabel}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {calling && actionsEnabled && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-muted/30 p-3">
          <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
            <span className="text-muted-foreground">Consultorio / box (opcional)</span>
            <input
              value={roomDraft}
              onChange={(event) => setRoomDraft(event.target.value)}
              placeholder="Ej. 1, Box A…"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitAdvance(roomDraft.trim() || undefined);
                }
                if (event.key === 'Escape') setCalling(false);
              }}
            />
          </label>
          <Button
            size="sm"
            isPending={pending}
            onClick={() => commitAdvance(roomDraft.trim() || undefined)}
          >
            {pending ? 'Llamando…' : 'Confirmar llamado'}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCalling(false)}>
            Cancelar
          </Button>
        </div>
      )}
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
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/agenda/${appointment.id}`}>Ver cita</Link>
        </Button>
        <WaitingRoomCheckInQrButton
          appointmentId={appointment.id}
          patientName={appointment.patient_name}
        />
        <Button size="sm" isPending={pending} onClick={handleCheckIn}>
          <CalendarPlus className="h-4 w-4" />
          {pending ? 'Ingresando...' : 'Check-in'}
        </Button>
      </div>
    </div>
  );
}
