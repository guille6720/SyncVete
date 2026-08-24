'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
import { ArrowUp, CalendarPlus, GripVertical, MessageCircle, Search, StickyNote, X } from 'lucide-react';
import {
  checkInAppointment,
  listWaitingRoom,
  removeWaitingRoomEntry,
  reorderWaitingRoom,
  reorderWaitingRoomQueue,
  updateWaitingRoomNotes,
  updateWaitingRoomStatus,
} from '@/actions/waiting-room';
import { startConsultationFromAppointment } from '@/actions/consultations';
import { WaitingRoomCheckInQrButton } from '@/components/waiting-room/waiting-room-check-in-qr-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import { useWaitingRoomLive } from '@/hooks/use-waiting-room-live';
import { WaitingRoomStaffSoundToggle } from '@/components/waiting-room/waiting-room-staff-sound-toggle';
import { playWaitingRoomStaffChimesOnRefresh } from '@/lib/waiting-room-chime';
import {
  APPOINTMENT_TYPE_LABELS,
  SPECIES_EMOJI,
  WAITING_ROOM_NEXT_ACTION_LABELS,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  WAITING_ROOM_STATUSES,
  WAITING_ROOM_TRANSITIONS,
  applyWaitingRoomQueueOrder,
  appendWaitingRoomBoardFilterParams,
  buildWhatsAppComposePath,
  collectWaitingRoomAssignedOptions,
  filterWaitingRoomCheckInCandidates,
  filterWaitingRoomEntries,
  formatAppointmentTime,
  formatWaitMinutes,
  minutesBetween,
  sortWaitingRoomQueue,
  type AppointmentListRow,
  type WaitingRoomBoardFilters,
  type WaitingRoomBoardStatusFilter,
  type WaitingRoomListRow,
  type WaitingRoomStatus,
} from '@sincvete/shared';

interface WaitingRoomBoardProps {
  entries: WaitingRoomListRow[];
  checkInCandidates: AppointmentListRow[];
  canWrite: boolean;
  canSendWhatsApp?: boolean;
  canStartConsultation?: boolean;
  whatsAppAutoEnabled?: boolean;
  boardSoundEnabled?: boolean;
  /** Selected day (YYYY-MM-DD). Write actions only apply when it is today. */
  todayLabel: string;
  isToday?: boolean;
  roomPresets?: string[];
  initialFilters?: WaitingRoomBoardFilters;
  syncFiltersToUrl?: boolean;
  branchOptions?: Array<{ id: string; name: string }>;
  sessionBranchId?: string | null;
  listBranchId?: string | 'all';
}

export function WaitingRoomBoard({
  entries: initialEntries,
  checkInCandidates,
  canWrite,
  canSendWhatsApp = false,
  canStartConsultation = false,
  whatsAppAutoEnabled = false,
  boardSoundEnabled = false,
  todayLabel,
  isToday = true,
  roomPresets = [],
  initialFilters,
  syncFiltersToUrl = false,
  branchOptions = [],
  sessionBranchId = null,
  listBranchId,
}: WaitingRoomBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState(() => sortWaitingRoomQueue(initialEntries));
  const [reordering, setReordering] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [filters, setFilters] = useState<WaitingRoomBoardFilters>(
    initialFilters ?? {
      query: '',
      status: 'all',
      assignedUserId: null,
    }
  );
  const canMutate = canWrite && isToday;

  useEffect(() => {
    setEntries(sortWaitingRoomQueue(initialEntries));
  }, [initialEntries]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await listWaitingRoom({
        date: todayLabel,
        branchId: listBranchId,
      });
      const sorted = sortWaitingRoomQueue(next);
      setEntries((prev) => {
        if (isToday) {
          playWaitingRoomStaffChimesOnRefresh(prev, sorted, { enabled: boardSoundEnabled });
        }
        return sorted;
      });
      router.refresh();
    } catch (error) {
      console.error('[waiting-room board] refresh failed', error);
    }
  }, [boardSoundEnabled, isToday, listBranchId, router, todayLabel]);

  useWaitingRoomLive(() => {
    if (reordering) return;
    void refresh();
  });

  const assignedOptions = useMemo(
    () => collectWaitingRoomAssignedOptions(entries, checkInCandidates),
    [checkInCandidates, entries]
  );

  const filteredEntries = useMemo(
    () => filterWaitingRoomEntries(entries, filters),
    [entries, filters]
  );

  const filteredCheckInCandidates = useMemo(
    () =>
      filterWaitingRoomCheckInCandidates(checkInCandidates, {
        query: filters.query,
        assignedUserId: filters.assignedUserId,
      }),
    [checkInCandidates, filters.assignedUserId, filters.query]
  );

  const hasActiveFilters =
    Boolean(filters.query?.trim()) ||
    (filters.status ?? 'all') !== 'all' ||
    Boolean(filters.assignedUserId);

  const updateFilters = useCallback(
    (next: WaitingRoomBoardFilters) => {
      const branchChanged = next.branchId !== filters.branchId;
      setFilters(next);
      if (!syncFiltersToUrl) return;
      const params = appendWaitingRoomBoardFilterParams(
        new URLSearchParams(searchParams.toString()),
        next
      );
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      if (branchChanged) {
        router.refresh();
      }
    },
    [filters.branchId, pathname, router, searchParams, syncFiltersToUrl]
  );

  const active = useMemo(
    () => filteredEntries.filter((row) => row.waiting_room_status !== 'completed'),
    [filteredEntries]
  );
  const completed = useMemo(
    () => filteredEntries.filter((row) => row.waiting_room_status === 'completed'),
    [filteredEntries]
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
      {boardSoundEnabled && isToday && (
        <div className="flex justify-end">
          <WaitingRoomStaffSoundToggle enabled={boardSoundEnabled} />
        </div>
      )}

      <WaitingRoomBoardFiltersBar
        filters={filters}
        assignedOptions={assignedOptions}
        branchOptions={branchOptions}
        sessionBranchId={sessionBranchId}
        onChange={updateFilters}
        onClear={() =>
          updateFilters({
            query: '',
            status: 'all',
            assignedUserId: null,
            branchId: undefined,
          })
        }
        hasActiveFilters={hasActiveFilters}
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Cola activa</h2>
          <p className="text-sm text-muted-foreground">
            {todayLabel} · {active.length} en sala
            {hasActiveFilters && entries.length !== filteredEntries.length
              ? ` · ${filteredEntries.length} coinciden con el filtro`
              : ''}
            {completed.length > 0
              ? ` · ${completed.length} completado${completed.length === 1 ? '' : 's'}`
              : ''}
            {canMutate && active.length > 1 && !hasActiveFilters ? ' · arrastrá para reordenar' : ''}
            {canMutate && active.length > 1 && hasActiveFilters
              ? ' · limpiá filtros para reordenar'
              : ''}
            {!isToday ? ' · solo lectura (día pasado o futuro)' : ''}
            {reordering ? ' · guardando…' : ''}
          </p>
        </div>

        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? 'Ningún paciente coincide con los filtros.'
                : 'Nadie en sala de espera por ahora.'}
            </p>
            {canMutate && !hasActiveFilters && checkInCandidates.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Podés hacer check-in de las citas de hoy más abajo.
              </p>
            )}
          </div>
        ) : canMutate && !hasActiveFilters ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {active.map((entry) => (
                  <SortableWaitingRoomRow
                    key={entry.waiting_room_entry_id}
                    entry={entry}
                    canWrite={canWrite}
                    canSendWhatsApp={canSendWhatsApp}
                    whatsAppAutoEnabled={whatsAppAutoEnabled}
                    canStartConsultation={canStartConsultation}
                    isToday={isToday}
                    roomPresets={roomPresets}
                    sortable
                    now={now}
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
                whatsAppAutoEnabled={whatsAppAutoEnabled}
                canStartConsultation={false}
                isToday={isToday}
                roomPresets={roomPresets}
                now={now}
              />
            ))}
          </div>
        )}
      </section>

      {canMutate && filteredCheckInCandidates.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Check-in pendiente</h2>
            <p className="text-sm text-muted-foreground">
              Citas de hoy que todavía no ingresaron a la cola
              {filteredCheckInCandidates.length !== checkInCandidates.length
                ? ` · ${filteredCheckInCandidates.length} visibles`
                : ''}
            </p>
          </div>
          <div className="space-y-2">
            {filteredCheckInCandidates.map((appointment) => (
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
              now={now}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function waitingRoomWhatsAppHref(
  entry: WaitingRoomListRow,
  options: { room?: string | null; template?: 'sala_espera_llamado' | 'sala_espera_pago' } = {}
): string {
  return buildWhatsAppComposePath({
    ownerId: entry.owner_id,
    patientId: entry.patient_id,
    appointmentId: entry.appointment_id,
    template: options.template ?? 'sala_espera_llamado',
    room: options.room?.trim() || entry.room || undefined,
  });
}

function SortableWaitingRoomRow({
  entry,
  canWrite,
  canSendWhatsApp,
  whatsAppAutoEnabled,
  canStartConsultation,
  isToday,
  roomPresets,
  sortable,
  now,
}: {
  entry: WaitingRoomListRow;
  canWrite: boolean;
  canSendWhatsApp: boolean;
  whatsAppAutoEnabled: boolean;
  canStartConsultation: boolean;
  isToday: boolean;
  roomPresets: string[];
  sortable: boolean;
  now: Date;
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
        whatsAppAutoEnabled={whatsAppAutoEnabled}
        canStartConsultation={canStartConsultation}
        isToday={isToday}
        roomPresets={roomPresets}
        now={now}
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
  whatsAppAutoEnabled = false,
  canStartConsultation,
  isToday,
  roomPresets = [],
  dragHandle = null,
  now,
}: {
  entry: WaitingRoomListRow;
  canWrite: boolean;
  canSendWhatsApp: boolean;
  whatsAppAutoEnabled?: boolean;
  canStartConsultation: boolean;
  isToday: boolean;
  roomPresets?: string[];
  dragHandle?: ReactNode;
  now: Date;
}) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const [calling, setCalling] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [roomDraft, setRoomDraft] = useState(entry.room ?? '');
  const [notesDraft, setNotesDraft] = useState(entry.internal_notes ?? '');
  const nextStatus = WAITING_ROOM_TRANSITIONS[entry.waiting_room_status];
  const nextLabel =
    nextStatus && entry.waiting_room_status !== 'completed'
      ? WAITING_ROOM_NEXT_ACTION_LABELS[
          entry.waiting_room_status as Exclude<WaitingRoomStatus, 'completed'>
        ]
      : null;
  const showWhatsApp =
    canSendWhatsApp &&
    (entry.waiting_room_status === 'called' || entry.waiting_room_status === 'payment_pending');
  const whatsappTemplate =
    entry.waiting_room_status === 'payment_pending' ? 'sala_espera_pago' : 'sala_espera_llamado';
  const actionsEnabled = canWrite && isToday && entry.waiting_room_status !== 'completed';
  const noteText = entry.internal_notes?.trim() || '';
  const showLiveWait =
    isToday &&
    entry.waiting_room_status !== 'completed' &&
    Boolean(entry.checked_in_at);
  const liveWaitMinutes = showLiveWait
    ? minutesBetween(entry.checked_in_at, now)
    : null;

  useEffect(() => {
    setNotesDraft(entry.internal_notes ?? '');
  }, [entry.internal_notes]);

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
        if (whatsAppAutoEnabled) {
          router.push(
            waitingRoomWhatsAppHref(entry, {
              room: room ?? result.data?.room,
              template: 'sala_espera_llamado',
            })
          );
          return;
        }
        const notify = window.confirm('¿Avisar al tutor por WhatsApp?');
        if (notify) {
          router.push(
            waitingRoomWhatsAppHref(entry, {
              room: room ?? result.data?.room,
              template: 'sala_espera_llamado',
            })
          );
          return;
        }
      }

      if (nextStatus === 'payment_pending' && canSendWhatsApp) {
        if (whatsAppAutoEnabled) {
          router.push(
            waitingRoomWhatsAppHref(entry, {
              template: 'sala_espera_pago',
            })
          );
          return;
        }
        const notify = window.confirm('¿Avisar al tutor por WhatsApp para pasar por recepción?');
        if (notify) {
          router.push(
            waitingRoomWhatsAppHref(entry, {
              template: 'sala_espera_pago',
            })
          );
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

  const saveNotes = () => {
    void runPending(async () => {
      const result = await updateWaitingRoomNotes({
        entryId: entry.waiting_room_entry_id,
        notes: notesDraft,
      });
      if (!result.success) {
        alert(result.error ?? 'No se pudo guardar la nota');
        return;
      }
      setEditingNotes(false);
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
              {liveWaitMinutes != null ? (
                <>
                  {' '}
                  · espera {formatWaitMinutes(liveWaitMinutes)}
                </>
              ) : null}
            </p>
            {noteText && !editingNotes && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <StickyNote className="mr-1 inline h-3 w-3" />
                {noteText}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/agenda/${entry.appointment_id}`}>Cita</Link>
          </Button>
          {showWhatsApp && (
            <Button variant="outline" size="sm" asChild>
              <Link href={waitingRoomWhatsAppHref(entry, { template: whatsappTemplate })}>
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Link>
            </Button>
          )}
          {actionsEnabled && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setEditingNotes((open) => !open);
                  setCalling(false);
                }}
              >
                <StickyNote className="h-4 w-4" />
                {noteText ? 'Editar nota' : 'Nota'}
              </Button>
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

      {editingNotes && actionsEnabled && (
        <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Nota interna (solo staff)</span>
            <textarea
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Alergia, trae radiografías, preferencia de box…"
              className="flex min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" isPending={pending} onClick={saveNotes}>
              {pending ? 'Guardando…' : 'Guardar nota'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setNotesDraft(entry.internal_notes ?? '');
                setEditingNotes(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {calling && actionsEnabled && (
        <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
          {roomPresets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {roomPresets.map((room) => (
                <Button
                  key={room}
                  type="button"
                  size="sm"
                  variant={roomDraft === room ? 'default' : 'outline'}
                  disabled={pending}
                  onClick={() => setRoomDraft(room)}
                >
                  {room}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
              <span className="text-muted-foreground">Consultorio / box (opcional)</span>
              <input
                value={roomDraft}
                onChange={(event) => setRoomDraft(event.target.value)}
                placeholder={roomPresets[0] ? `Ej. ${roomPresets[0]}` : 'Ej. 1, Box A…'}
                list={`waiting-room-room-presets-${entry.waiting_room_entry_id}`}
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
              {roomPresets.length > 0 && (
                <datalist id={`waiting-room-room-presets-${entry.waiting_room_entry_id}`}>
                  {roomPresets.map((room) => (
                    <option key={room} value={room} />
                  ))}
                </datalist>
              )}
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

function WaitingRoomBoardFiltersBar({
  filters,
  assignedOptions,
  branchOptions,
  sessionBranchId,
  onChange,
  onClear,
  hasActiveFilters,
}: {
  filters: WaitingRoomBoardFilters;
  assignedOptions: Array<{ userId: string; name: string }>;
  branchOptions: Array<{ id: string; name: string }>;
  sessionBranchId: string | null;
  onChange: (next: WaitingRoomBoardFilters) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}) {
  const branchValue =
    filters.branchId === 'all'
      ? 'all'
      : filters.branchId ?? sessionBranchId ?? '';

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Buscar</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query ?? ''}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Paciente o propietario"
            className="pl-9"
          />
        </div>
      </label>

      <label className="flex w-full flex-col gap-1.5 sm:w-44">
        <span className="text-xs font-medium text-muted-foreground">Estado</span>
        <Select
          value={filters.status ?? 'all'}
          onChange={(event) =>
            onChange({
              ...filters,
              status: event.target.value as WaitingRoomBoardStatusFilter,
            })
          }
        >
          <option value="all">Todos</option>
          <option value="active">En flujo</option>
          {WAITING_ROOM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {WAITING_ROOM_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex w-full flex-col gap-1.5 sm:w-48">
        <span className="text-xs font-medium text-muted-foreground">Profesional</span>
        <Select
          value={filters.assignedUserId ?? ''}
          onChange={(event) =>
            onChange({
              ...filters,
              assignedUserId: event.target.value || null,
            })
          }
        >
          <option value="">Todos</option>
          {assignedOptions.map((option) => (
            <option key={option.userId} value={option.userId}>
              {option.name}
            </option>
          ))}
        </Select>
      </label>

      {branchOptions.length > 1 && (
        <label className="flex w-full flex-col gap-1.5 sm:w-48">
          <span className="text-xs font-medium text-muted-foreground">Sucursal</span>
          <Select
            value={branchValue}
            onChange={(event) => {
              const value = event.target.value;
              onChange({
                ...filters,
                branchId:
                  value === 'all'
                    ? 'all'
                    : value === sessionBranchId || value === ''
                      ? undefined
                      : value,
              });
            }}
          >
            {sessionBranchId && (
              <option value={sessionBranchId}>
                {branchOptions.find((b) => b.id === sessionBranchId)?.name ?? 'Mi sucursal'}
              </option>
            )}
            <option value="all">Todas las sucursales</option>
            {branchOptions
              .filter((branch) => branch.id !== sessionBranchId)
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </Select>
        </label>
      )}

      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
