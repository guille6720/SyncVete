'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createAppointment, updateAppointment } from '@/actions/appointments';
import { PatientPicker } from '@/components/appointments/patient-picker';
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
  DEFAULT_APPOINTMENT_DURATION_MINUTES,
  TOUR_TARGETS,
  getDurationMinutes,
  toLocalDateTimeInput,
  type AppointmentListRow,
  type AssignableStaffMember,
} from '@sincvete/shared';

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
}: AppointmentFormProps) {
  const action = appointment
    ? updateAppointment.bind(null, appointment.id)
    : createAppointment;
  const [state, formAction, pending] = useActionState(action, null);

  const defaultDuration = appointment
    ? getDurationMinutes(appointment.starts_at, appointment.ends_at)
    : DEFAULT_APPOINTMENT_DURATION_MINUTES;

  const startsAtDefault =
    appointment?.starts_at
      ? toLocalDateTimeInput(appointment.starts_at)
      : defaultStartsAt ?? toLocalDateTimeInput(new Date().toISOString());

  return (
    <Card data-tour={TOUR_TARGETS.AGENDA_FORM}>
      <CardHeader>
        <CardTitle>{appointment ? 'Editar cita' : 'Nueva cita'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-2xl gap-4">
          <div data-tour={TOUR_TARGETS.AGENDA_FORM_PATIENT}>
            <PatientPicker
              defaultPatientId={appointment?.patient_id ?? defaultPatientId}
              defaultPatientName={appointment?.patient_name ?? defaultPatientName}
              defaultOwnerId={appointment?.owner_id ?? defaultOwnerId}
              defaultOwnerName={appointment?.owner_full_name ?? defaultOwnerName}
              error={state?.fieldErrors?.patientId?.[0] ?? state?.fieldErrors?.ownerId?.[0]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2" data-tour={TOUR_TARGETS.AGENDA_FORM_SCHEDULE}>
            <div className="space-y-2">
              <Label htmlFor="startsAt">Fecha y hora *</Label>
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={startsAtDefault}
              />
              {state?.fieldErrors?.startsAt && (
                <p className="text-sm text-destructive">{state.fieldErrors.startsAt[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duración (min)</Label>
              <Select
                id="durationMinutes"
                name="durationMinutes"
                defaultValue={String(defaultDuration)}
              >
                {APPOINTMENT_DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appointmentType">Tipo</Label>
              <Select
                id="appointmentType"
                name="appointmentType"
                defaultValue={appointment?.appointment_type ?? 'consulta'}
              >
                {APPOINTMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {APPOINTMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignedUserId">Profesional</Label>
              <Select
                id="assignedUserId"
                name="assignedUserId"
                defaultValue={appointment?.assigned_user_id ?? ''}
              >
                <option value="">Sin asignar</option>
                {staff.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal *</Label>
              <Select
                id="branchId"
                name="branchId"
                required
                defaultValue={appointment?.branch_id ?? defaultBranchId ?? ''}
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

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && appointment && (
            <p className="text-sm text-emerald-600">Cita actualizada correctamente</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" isPending={pending}>
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
