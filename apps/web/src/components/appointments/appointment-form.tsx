'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { createAppointment, updateAppointment } from '@/actions/appointments';
import {
  getProfessionalAgendaContext,
  type ProfessionalAgendaContext,
} from '@/actions/appointment-availability';
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
  getDurationMinutes,
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
}: AppointmentFormProps) {
  const action = appointment
    ? updateAppointment.bind(null, appointment.id)
    : createAppointment;
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();

  const defaultDuration = appointment
    ? getDurationMinutes(appointment.starts_at, appointment.ends_at)
    : DEFAULT_APPOINTMENT_DURATION_MINUTES;

  const startsAtDefault =
    appointment?.starts_at
      ? toLocalDateTimeInput(appointment.starts_at)
      : defaultStartsAt ?? toLocalDateTimeInput(new Date().toISOString());

  const branchDefault = appointment?.branch_id ?? defaultBranchId ?? '';
  const [selectedBranchId, setSelectedBranchId] = useState(branchDefault);
  const [assignedUserId, setAssignedUserId] = useState(
    appointment?.assigned_user_id ?? defaultAssignedUserId ?? ''
  );
  const [startsAt, setStartsAt] = useState(startsAtDefault);
  const [durationMinutes, setDurationMinutes] = useState(String(defaultDuration));
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    appointment?.appointment_type ?? 'consulta'
  );
  const [proContext, setProContext] = useState<ProfessionalAgendaContext | null>(null);
  const [proPending, setProPending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const visibleStaff = useMemo(
    () => filterAssignableStaffByBranch(staff, selectedBranchId || null),
    [staff, selectedBranchId]
  );

  const selectedStaff = useMemo(
    () => visibleStaff.find((member) => member.userId === assignedUserId) ?? null,
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
    void getProfessionalAgendaContext({
      userId: assignedUserId,
      branchId: selectedBranchId || null,
    })
      .then((ctx) => {
        if (!cancelled) setProContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setProContext(null);
      })
      .finally(() => {
        if (!cancelled) setProPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedUserId, selectedBranchId]);

  const selectedDate = startsAt.slice(0, 10);
  const durationNum = Number(durationMinutes) || DEFAULT_APPOINTMENT_DURATION_MINUTES;
  const schedules = proContext?.schedules ?? [];
  const scheduleEnforced = schedules.length > 0;

  const slots = useMemo(() => {
    if (!scheduleEnforced || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return [];
    return buildLocalSlotsForDate({
      dateStr: selectedDate,
      schedules,
      durationMinutes: durationNum,
      appointmentType,
    });
  }, [scheduleEnforced, selectedDate, schedules, durationNum, appointmentType]);

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
        <CardTitle>{appointment ? 'Editar cita' : 'Nueva cita'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="grid max-w-2xl gap-4">
          <PatientPicker
            defaultPatientId={appointment?.patient_id ?? defaultPatientId}
            defaultPatientName={appointment?.patient_name ?? defaultPatientName}
            defaultOwnerId={appointment?.owner_id ?? defaultOwnerId}
            defaultOwnerName={appointment?.owner_full_name ?? defaultOwnerName}
            defaultBranchId={branchDefault}
            error={state?.fieldErrors?.patientId?.[0] ?? state?.fieldErrors?.ownerId?.[0]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assignedUserId">Profesional</Label>
              <Select
                id="assignedUserId"
                name="assignedUserId"
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {visibleStaff.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName}
                    {member.specialty ? ` · ${member.specialty}` : ''}
                  </option>
                ))}
              </Select>
              {visibleStaff.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay profesionales con usuario de la app en esta sucursal. Invitá al equipo en
                  Configuración o vinculá un usuario en Profesionales.
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
                  onChange={(e) => setSelectedBranchId(e.target.value)}
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
                selectedDate={selectedDate}
              />
            )
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
                {APPOINTMENT_DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {scheduleEnforced ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Horarios disponibles ese día</p>
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay franjas ese día según la ficha. Cambiá la fecha o el profesional.
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
                defaultValue={appointment?.consultation_mode ?? 'clinic'}
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
                defaultValue={appointment?.expected_payment_method ?? ''}
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
                defaultValue={appointment?.room ?? ''}
                placeholder="Consultorio 1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Motivo</Label>
            <Input
              id="title"
              name="title"
              defaultValue={appointment?.title ?? ''}
              placeholder="Control anual, vacuna antirrábica..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" defaultValue={appointment?.notes ?? ''} rows={3} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Recordatorios</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="remind24h"
                  value="true"
                  defaultChecked={appointment?.remind_24h ?? true}
                />
                Recordatorio 24 h
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="remind2h"
                  value="true"
                  defaultChecked={appointment?.remind_2h ?? true}
                />
                Recordatorio 2 h
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="remindConfirmation"
                  value="true"
                  defaultChecked={appointment?.remind_confirmation ?? true}
                />
                Pedir confirmación
              </label>
            </div>
          </fieldset>

          {appointment && (
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select id="status" name="status" defaultValue={appointment.status}>
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
                defaultValue={appointment.cancellation_reason ?? ''}
              />
            </div>
          )}

          {(clientError || state?.error) && (
            <p className="text-sm text-destructive">{clientError ?? state?.error}</p>
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
              disabled={Boolean(assignedUserId && scheduleEnforced && !scheduleValidation.ok)}
            >
              {pending ? 'Guardando...' : appointment ? 'Guardar cambios' : 'Crear cita'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={appointment ? `/agenda/${appointment.id}` : '/agenda'}>Cancelar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
