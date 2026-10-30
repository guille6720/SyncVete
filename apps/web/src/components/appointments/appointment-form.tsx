'use client';

import { agendaMemberKey } from '@sincvete/shared';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createAppointment, updateAppointment } from '@/actions/appointments';
import {
  getAgendaBusyRanges,
  type AgendaBusyRange,
  getProfessionalAgendaContext,
  type ProfessionalAgendaContext,
} from '@/actions/appointment-availability';
import { AgendaProblemNotice } from './agenda-problem-notice';
import { PatientPicker } from '@/components/appointments/patient-picker';
import { ProfessionalSchedulePanel } from '@/components/appointments/professional-schedule-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  APPOINTMENT_DURATION_OPTIONS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABELS,
  CONSULTATION_MODES,
  CONSULTATION_MODE_LABELS,
  DEFAULT_APPOINTMENT_DURATION_MINUTES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  buildLocalSlotsForDate,
  filterAssignableStaffByBranch,
  fromLocalDateTimeInput,
  findNextLocalSlot,
  getDurationMinutes,
  getPreferredSlotDurationMinutes,
  toLocalDateTimeInput,
  validateLocalStartAgainstSchedules,
  type AppointmentListRow,
  type AppointmentType,
  type AssignableStaffMember,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

interface AppointmentFormProps {
  appointment?: AppointmentListRow;
  staff: AssignableStaffMember[];
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  defaultPatientId?: string;
  defaultPatientName?: string;
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  defaultStartsAt?: string;
  defaultAssignedUserId?: string | null;
  justCreated?: boolean;
}

export function AppointmentForm({
  appointment,
  staff,
  branches,
  defaultBranchId,
  defaultPatientId,
  defaultPatientName,
  defaultOwnerId,
  defaultOwnerName,
  defaultStartsAt,
  defaultAssignedUserId = null,
  justCreated = false,
}: AppointmentFormProps) {
  const defaultsFor = useRef('');
  const action = appointment ? updateAppointment.bind(null, appointment.id) : createAppointment;
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();

  const defaultDuration = appointment
    ? getDurationMinutes(appointment.starts_at, appointment.ends_at)
    : DEFAULT_APPOINTMENT_DURATION_MINUTES;

  const startsAtDefault = appointment?.starts_at
    ? toLocalDateTimeInput(appointment.starts_at)
    : (defaultStartsAt ?? toLocalDateTimeInput(new Date().toISOString()));

  const branchDefault = appointment?.branch_id ?? defaultBranchId ?? '';
  const [selectedBranchId, setSelectedBranchId] = useState(branchDefault);
  const [assignedUserId, setAssignedUserId] = useState(
    appointment?.assigned_professional_id ??
      appointment?.assigned_user_id ??
      defaultAssignedUserId ??
      ''
  );
  const [startsAt, setStartsAt] = useState(startsAtDefault);
  const [durationMinutes, setDurationMinutes] = useState(String(defaultDuration));
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    appointment?.appointment_type ?? 'consulta'
  );
  const [proContext, setProContext] = useState<ProfessionalAgendaContext | null>(null);
  const [proPending, setProPending] = useState(false);
  const [patientSummary, setPatientSummary] = useState({
    name: appointment?.patient_name ?? defaultPatientName ?? '',
    owner: appointment?.owner_full_name ?? defaultOwnerName ?? '',
  });
  const [contextError, setContextError] = useState<string | null>(null);
  const [busyRanges, setBusyRanges] = useState<AgendaBusyRange[]>([]);
  const [busyPending, setBusyPending] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [extra, setExtra] = useState({
    title: appointment?.title ?? '',
    notes: appointment?.notes ?? '',
    room: appointment?.room ?? '',
    cancellationReason: appointment?.cancellation_reason ?? '',
  });
  const [options, setOptions] = useState({
    consultationMode: appointment?.consultation_mode ?? 'clinic',
    expectedPaymentMethod: appointment?.expected_payment_method ?? '',
    status: appointment?.status ?? 'programada',
  });
  const [reminders, setReminders] = useState({
    remind24h: appointment?.remind_24h ?? true,
    remind2h: appointment?.remind_2h ?? true,
    remindConfirmation: appointment?.remind_confirmation ?? true,
  });
  const [clientError, setClientError] = useState<string | null>(null);

  const visibleStaff = useMemo(
    () => filterAssignableStaffByBranch(staff, selectedBranchId || null),
    [staff, selectedBranchId]
  );

  const selectedStaff = useMemo(
    () => visibleStaff.find((member) => agendaMemberKey(member) === assignedUserId) ?? null,
    [visibleStaff, assignedUserId]
  );

  useEffect(() => {
    if (!assignedUserId) {
      setProContext(null);
      setProPending(false);
      return;
    }
    let cancelled = false;
    setProPending(true);
    setContextError(null);
    setProContext(null);
    void getProfessionalAgendaContext({
      userId: assignedUserId,
      branchId: selectedBranchId || null,
    })
      .then((ctx) => {
        if (cancelled) return;
        setProContext(ctx);
        // Editing an existing appointment: keep saved start/duration.
        const defaultsKey = `${assignedUserId}:${selectedBranchId}`;
        if (appointment || defaultsFor.current === defaultsKey) return;
        defaultsFor.current = defaultsKey;
        const schedules = ctx?.schedules ?? [];
        if (schedules.length === 0) return;

        const preferredDuration =
          getPreferredSlotDurationMinutes(schedules) ?? DEFAULT_APPOINTMENT_DURATION_MINUTES;
        setDurationMinutes(String(preferredDuration));

        const preferredDate = (startsAtDefault || startsAt).slice(0, 10);
        const nextSlot = findNextLocalSlot({
          preferredDateStr: preferredDate,
          schedules,
          durationMinutes: preferredDuration,
          appointmentType,
        });
        if (nextSlot) {
          setStartsAt(nextSlot.startsAtLocal);
          setDurationMinutes(String(nextSlot.durationMinutes));
          setClientError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProContext(null);
          setContextError(
            'No se pudo cargar la agenda. Revisá tu conexión y reintentá; tus datos siguen cargados.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setProPending(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentional: re-apply ficha defaults only when professional/branch change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startsAt/appointmentType would fight user edits
  }, [assignedUserId, selectedBranchId, appointment, reloadToken]);

  const selectedDate = startsAt.slice(0, 10);
  const durationNum = Number(durationMinutes) || DEFAULT_APPOINTMENT_DURATION_MINUTES;
  const schedules = useMemo(() => proContext?.schedules ?? [], [proContext]);
  const scheduleEnforced = schedules.length > 0;
  const missingHours = Boolean(
    selectedStaff?.professionalId && !proPending && proContext && !schedules.length
  );
  const hoursHref = selectedStaff?.professionalId
    ? `/profesionales/${selectedStaff.professionalId}`
    : '/agenda/disponibilidad';
  useEffect(() => {
    if (!assignedUserId || !selectedBranchId || !selectedDate) {
      setBusyRanges([]);
      return;
    }
    let cancelled = false;
    setBusyPending(true);
    setBusyError(null);
    void getAgendaBusyRanges({
      assigneeId: assignedUserId,
      branchId: selectedBranchId,
      date: selectedDate,
    })
      .then((rows) => {
        if (!cancelled) setBusyRanges(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setBusyRanges([]);
          setBusyError(
            'No se pudieron comprobar los horarios libres. Revisá tu conexión y reintentá.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBusyPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedUserId, selectedBranchId, selectedDate, reloadToken]);
  const slotBusy = (local: string) => {
    const start = Date.parse(fromLocalDateTimeInput(local));
    const end = start + durationNum * 60000;
    return busyRanges.some(
      (r) =>
        r.id !== appointment?.id && Date.parse(r.startsAt) < end && Date.parse(r.endsAt) > start
    );
  };

  const durationOptions = useMemo(() => {
    const fromFicha = getPreferredSlotDurationMinutes(schedules);
    const values = new Set<number>([...APPOINTMENT_DURATION_OPTIONS]);
    if (fromFicha) values.add(fromFicha);
    const current = Number(durationMinutes);
    if (Number.isFinite(current) && current > 0) values.add(current);
    return [...values].sort((a, b) => a - b);
  }, [schedules, durationMinutes]);

  const slots = useMemo(() => {
    if (!scheduleEnforced || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return [];
    return buildLocalSlotsForDate({
      dateStr: selectedDate,
      schedules,
      durationMinutes: durationNum,
      appointmentType,
    }).filter((slot) => !slotBusy(slot.startsAtLocal));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotBusy reads these explicit dependencies
  }, [
    scheduleEnforced,
    selectedDate,
    schedules,
    durationNum,
    appointmentType,
    busyRanges,
    appointment?.id,
  ]);

  const scheduleValidation = useMemo(() => {
    if (!assignedUserId || !scheduleEnforced) {
      return { ok: true, enforced: false as const };
    }
    return validateLocalStartAgainstSchedules({
      startsAtLocal: startsAt,
      durationMinutes: durationNum,
      schedules,
      appointmentType,
    });
  }, [assignedUserId, scheduleEnforced, startsAt, durationNum, schedules, appointmentType]);

  const handleSubmit = (formData: FormData) => {
    setClientError(null);
    if (proPending || busyPending || contextError || busyError || missingHours) {
      setClientError(
        missingHours
          ? 'El profesional no tiene horarios cargados. Agregá días y horarios en su ficha.'
          : (contextError ??
              busyError ??
              'Estamos comprobando la agenda. Esperá un momento y reintentá.')
      );
      return;
    }
    if (assignedUserId && slotBusy(startsAt)) {
      setClientError('El turno acaba de ocuparse. Elegí otro horario; tus datos siguen cargados.');
      setReloadToken((t) => t + 1);
      return;
    }
    if (assignedUserId && scheduleEnforced) {
      const check = validateLocalStartAgainstSchedules({
        startsAtLocal: String(formData.get('startsAt') || startsAt),
        durationMinutes: Number(formData.get('durationMinutes')) || durationNum,
        schedules,
        appointmentType: String(formData.get('appointmentType') || appointmentType),
      });
      if (!check.ok) {
        setClientError(check.reason ?? 'Horario fuera de la agenda del profesional');
        return;
      }
    }
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {appointment ? 'Editar turno' : justCreated ? 'Asignar primer turno' : 'Nuevo turno'}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form action={handleSubmit} className="grid min-w-0 gap-4" id="appointment-booking-form">
          {justCreated ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
            >
              El profesional y su agenda ya están listos. Elegí el paciente y el horario.
            </p>
          ) : null}
          <PatientPicker
            onSelectionChange={(name, owner) => setPatientSummary({ name, owner })}
            defaultPatientId={appointment?.patient_id ?? defaultPatientId}
            defaultPatientName={appointment?.patient_name ?? defaultPatientName}
            defaultOwnerId={appointment?.owner_id ?? defaultOwnerId}
            defaultOwnerName={appointment?.owner_full_name ?? defaultOwnerName}
            defaultBranchId={selectedBranchId}
            error={state?.fieldErrors?.patientId?.[0] ?? state?.fieldErrors?.ownerId?.[0]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assignedUserId">Profesional</Label>
              <Select
                id="assignedUserId"
                name="assignedUserId"
                value={assignedUserId}
                onChange={(e) => {
                  setAssignedUserId(e.target.value);
                  setProContext(null);
                  setProPending(Boolean(e.target.value));
                }}
              >
                <option value="">Sin asignar</option>
                {visibleStaff.map((member) => (
                  <option key={agendaMemberKey(member)} value={agendaMemberKey(member)}>
                    {member.fullName}
                    {member.specialty ? ` · ${member.specialty}` : ''}
                  </option>
                ))}
              </Select>
              {visibleStaff.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay profesionales disponibles en esta sucursal. Agregá uno desde Profesionales
                  y asignale días y horarios.
                </p>
              ) : null}
            </div>
            {branches.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="branchId">Sucursal *</Label>
                <Select
                  id="branchId"
                  name="branchId"
                  required
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setProContext(null);
                    setProPending(Boolean(assignedUserId));
                  }}
                >
                  <option value="">—</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {assignedUserId ? (
            proPending && !proContext ? (
              <p className="text-sm text-muted-foreground">Cargando ficha del profesional…</p>
            ) : (
              <ProfessionalSchedulePanel
                fullName={proContext?.fullName ?? selectedStaff?.fullName ?? 'Profesional'}
                specialty={proContext?.specialty ?? selectedStaff?.specialty}
                schedules={schedules}
                editHref={hoursHref}
                selectedDate={selectedDate}
              />
            )
          ) : null}

          {contextError ? (
            <AgendaProblemNotice
              message={contextError}
              onRetry={() => setReloadToken((t) => t + 1)}
            />
          ) : null}
          {missingHours ? (
            <AgendaProblemNotice
              message="El profesional no tiene horarios cargados. Abrí su ficha y agregá días y horarios antes de asignar un turno."
              hoursHref={hoursHref}
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startsAt">Fecha y hora *</Label>
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                aria-invalid={scheduleValidation.enforced && !scheduleValidation.ok}
              />
              {state?.fieldErrors?.startsAt && (
                <p className="text-sm text-destructive">{state.fieldErrors.startsAt[0]}</p>
              )}
              {scheduleValidation.enforced && !scheduleValidation.ok ? (
                <p className="text-sm text-destructive">{scheduleValidation.reason}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duración (min)</Label>
              <Select
                id="durationMinutes"
                name="durationMinutes"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              >
                {durationOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                    {getPreferredSlotDurationMinutes(schedules) === minutes ? ' (ficha)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {scheduleEnforced ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Horarios disponibles ese día</p>
              {busyPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Comprobando horarios libres…
                </p>
              ) : busyError ? (
                <AgendaProblemNotice
                  message={busyError}
                  onRetry={() => setReloadToken((t) => t + 1)}
                />
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay horarios libres ese día. Elegí otra fecha o usá «Ver próximos horarios».
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => {
                    const active = startsAt === slot.startsAtLocal;
                    return (
                      <button
                        key={slot.startsAtLocal}
                        type="button"
                        className={cn(
                          'rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:bg-muted'
                        )}
                        onClick={() => {
                          setStartsAt(slot.startsAtLocal);
                          setDurationMinutes(String(slot.durationMinutes));
                          setClientError(null);
                        }}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {scheduleEnforced ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={() => {
                const next = findNextLocalSlot({
                  preferredDateStr: selectedDate,
                  schedules,
                  durationMinutes: durationNum,
                  appointmentType,
                });
                if (next && next.startsAtLocal.slice(0, 10) !== selectedDate) {
                  setStartsAt(next.startsAtLocal);
                  return;
                }
                const free = slots.find((slot) => slot.startsAtLocal > startsAt);
                if (free) {
                  setStartsAt(free.startsAtLocal);
                  return;
                }
                const nextDay = new Date(`${selectedDate}T12:00:00Z`);
                nextDay.setUTCDate(nextDay.getUTCDate() + 1);
                const future = findNextLocalSlot({
                  preferredDateStr: nextDay.toISOString().slice(0, 10),
                  schedules,
                  durationMinutes: durationNum,
                  appointmentType,
                });
                if (future) setStartsAt(future.startsAtLocal);
              }}
            >
              Ver próximos horarios
            </Button>
          ) : null}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Más opciones del turno</summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="appointmentType">Tipo</Label>
                  <Select
                    id="appointmentType"
                    name="appointmentType"
                    value={appointmentType}
                    onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
                  >
                    {APPOINTMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {APPOINTMENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="consultationMode">Modalidad</Label>
                  <Select
                    id="consultationMode"
                    name="consultationMode"
                    value={options.consultationMode}
                    onChange={(e) =>
                      setOptions((v) => ({
                        ...v,
                        consultationMode: e.target.value as typeof v.consultationMode,
                      }))
                    }
                  >
                    {CONSULTATION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {CONSULTATION_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expectedPaymentMethod">Medio de pago esperado</Label>
                  <Select
                    id="expectedPaymentMethod"
                    name="expectedPaymentMethod"
                    value={options.expectedPaymentMethod}
                    onChange={(e) =>
                      setOptions((v) => ({ ...v, expectedPaymentMethod: e.target.value }))
                    }
                  >
                    <option value="">Sin especificar</option>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room">Consultorio / sala</Label>
                  <Input
                    id="room"
                    name="room"
                    value={extra.room}
                    onChange={(e) => setExtra((v) => ({ ...v, room: e.target.value }))}
                    placeholder="Consultorio 1"
                  />
                </div>
              </div>
            </div>
          </details>
          <div className="space-y-2">
            <Label htmlFor="title">Motivo</Label>
            <Input
              id="title"
              name="title"
              value={extra.title}
              onChange={(e) => setExtra((v) => ({ ...v, title: e.target.value }))}
              placeholder="Control anual, vacuna antirrábica..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              name="notes"
              value={extra.notes}
              onChange={(e) => setExtra((v) => ({ ...v, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Recordatorios</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="remind24h"
                  value="true"
                  checked={reminders.remind24h}
                  onChange={(e) => setReminders((v) => ({ ...v, remind24h: e.target.checked }))}
                />
                Recordatorio 24 h
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="remind2h"
                  value="true"
                  checked={reminders.remind2h}
                  onChange={(e) => setReminders((v) => ({ ...v, remind2h: e.target.checked }))}
                />
                Recordatorio 2 h
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="remindConfirmation"
                  value="true"
                  checked={reminders.remindConfirmation}
                  onChange={(e) =>
                    setReminders((v) => ({ ...v, remindConfirmation: e.target.checked }))
                  }
                />
                Pedir confirmación
              </label>
            </div>
          </fieldset>

          {appointment && (
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                id="status"
                name="status"
                value={options.status}
                onChange={(e) =>
                  setOptions((v) => ({ ...v, status: e.target.value as typeof v.status }))
                }
              >
                {APPOINTMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {APPOINTMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {appointment?.status === 'cancelada' && (
            <div className="space-y-2">
              <Label htmlFor="cancellationReason">Motivo de cancelación</Label>
              <Input
                id="cancellationReason"
                name="cancellationReason"
                value={extra.cancellationReason}
                onChange={(e) => setExtra((v) => ({ ...v, cancellationReason: e.target.value }))}
              />
            </div>
          )}

          {(clientError || state?.error) && (
            <AgendaProblemNotice
              message={clientError ?? state?.error ?? ''}
              hoursHref={hoursHref}
              onRetry={() => setReloadToken((t) => t + 1)}
              onSlots={() => {
                setClientError(null);
                setReloadToken((t) => t + 1);
              }}
            />
          )}
          {state?.success && appointment && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Cita actualizada correctamente
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              isPending={pending}
              disabled={Boolean(
                proPending ||
                busyPending ||
                contextError ||
                busyError ||
                missingHours ||
                (assignedUserId && scheduleEnforced && !scheduleValidation.ok)
              )}
            >
              {pending ? 'Guardando...' : appointment ? 'Guardar cambios' : 'Confirmar turno'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={appointment ? `/agenda/${appointment.id}` : '/agenda'}>Cancelar</Link>
            </Button>
          </div>
        </form>
        <aside className="space-y-4 rounded-xl border bg-muted/20 p-4 lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold">Resumen del turno</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Paciente y tutor</dt>
              <dd className="font-medium">{patientSummary.name || 'Elegí un paciente'}</dd>
              {patientSummary.owner ? (
                <dd className="text-xs text-muted-foreground">{patientSummary.owner}</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-muted-foreground">Profesional</dt>
              <dd className="font-medium">{selectedStaff?.fullName || 'Sin asignar'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha y hora</dt>
              <dd>{startsAt.replace('T', ' · ')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duración</dt>
              <dd>{durationMinutes} minutos</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sucursal</dt>
              <dd>
                {branches.find((b) => b.id === selectedBranchId)?.name || 'Elegí una sucursal'}
              </dd>
            </div>
          </dl>
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Los recordatorios se procesan solo si están habilitados. Confirmá los datos del paciente
            antes de guardar.
          </p>
        </aside>
      </CardContent>
    </Card>
  );
}
