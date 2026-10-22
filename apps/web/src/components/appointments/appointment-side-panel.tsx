'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  Pencil,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
} from '@/actions/appointments';
import { startConsultationFromAppointment } from '@/actions/consultations';
import { checkInAppointment } from '@/actions/waiting-room';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  APPOINTMENT_DURATION_OPTIONS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  APPOINTMENT_TYPE_LABELS,
  CONSULTATION_MODE_LABELS,
  PAYMENT_METHOD_LABELS,
  SPECIES_EMOJI,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  formatAppointmentDateTime,
  getDurationMinutes,
  toLocalDateTimeInput,
  fromLocalDateTimeInput,
  type AppointmentListRow,
  type AppointmentStatus,
  type ConsultationMode,
  type PaymentMethod,
  type WaitingRoomStatus,
} from '@sincvete/shared';

interface AppointmentSidePanelProps {
  appointment: AppointmentListRow | null;
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  canStartConsultation?: boolean;
  canCheckInWaitingRoom?: boolean;
  canBilling?: boolean;
  canVaccination?: boolean;
  waitingRoomStatus?: WaitingRoomStatus | null;
}

const STATUS_ACTIONS: Partial<
  Record<AppointmentStatus, { label: string; next: AppointmentStatus }[]>
> = {
  programada: [
    { label: 'Confirmar', next: 'confirmada' },
    { label: 'Cancelar', next: 'cancelada' },
  ],
  confirmada: [
    { label: 'Iniciar', next: 'en_curso' },
    { label: 'Marcar ausente', next: 'ausente' },
    { label: 'Cancelar', next: 'cancelada' },
  ],
  en_curso: [{ label: 'Completar', next: 'completada' }],
};

type DialogState =
  | { type: 'status'; status: AppointmentStatus }
  | { type: 'delete' }
  | { type: 'alert'; message: string }
  | null;

export function AppointmentSidePanel({
  appointment,
  open,
  onClose,
  canWrite,
  canStartConsultation = false,
  canCheckInWaitingRoom = false,
  canBilling = false,
  canVaccination = false,
  waitingRoomStatus = null,
}: AppointmentSidePanelProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleStartsAt, setRescheduleStartsAt] = useState('');
  const [rescheduleDuration, setRescheduleDuration] = useState('30');

  if (!open || !appointment) return null;

  const actions = STATUS_ACTIONS[appointment.status] ?? [];
  const canCheckIn =
    canCheckInWaitingRoom &&
    appointment.status !== 'cancelada' &&
    appointment.status !== 'completada' &&
    appointment.status !== 'ausente';

  const openReschedule = () => {
    setRescheduleStartsAt(toLocalDateTimeInput(appointment.starts_at));
    setRescheduleDuration(
      String(getDurationMinutes(appointment.starts_at, appointment.ends_at))
    );
    setRescheduleOpen(true);
  };

  const handleStatusChange = (status: AppointmentStatus) => {
    if (status === 'cancelada') {
      setCancelReason('');
      setCancelOpen(true);
      return;
    }
    setDialog({ type: 'status', status });
  };

  const confirmStatus = (status: AppointmentStatus, reason?: string) => {
    void runPending(async () => {
      const result = await updateAppointmentStatus(
        appointment.id,
        status,
        reason
      );
      if (!result.success) {
        setDialog({ type: 'alert', message: result.error ?? 'No se pudo actualizar el estado' });
        return;
      }
      router.refresh();
    });
  };

  const handleCheckIn = () => {
    void runPending(async () => {
      const result = await checkInAppointment(appointment.id);
      if (!result.success) {
        setDialog({ type: 'alert', message: result.error ?? 'No se pudo hacer check-in' });
        return;
      }
      router.push('/sala-espera');
    });
  };

  const handleStartConsultation = () => {
    void runPending(async () => {
      const result = await startConsultationFromAppointment(appointment.id);
      if (result && !result.success) {
        setDialog({
          type: 'alert',
          message: result.error ?? 'No se pudo iniciar la consulta',
        });
      }
    });
  };

  const handleDelete = () => {
    void runPending(async () => {
      const result = await deleteAppointment(appointment.id);
      if (!result.success) {
        setDialog({ type: 'alert', message: result.error ?? 'No se pudo eliminar la cita' });
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const handleReschedule = () => {
    if (!rescheduleStartsAt) return;
    void runPending(async () => {
      const result = await rescheduleAppointment(
        appointment.id,
        fromLocalDateTimeInput(rescheduleStartsAt),
        Number(rescheduleDuration) || 30
      );
      if (!result.success) {
        setRescheduleOpen(false);
        setDialog({
          type: 'alert',
          message: result.error ?? 'No se pudo reprogramar la cita',
        });
        return;
      }
      setRescheduleOpen(false);
      router.refresh();
    });
  };

  const paymentLabel =
    appointment.expected_payment_method &&
    appointment.expected_payment_method in PAYMENT_METHOD_LABELS
      ? PAYMENT_METHOD_LABELS[appointment.expected_payment_method as PaymentMethod]
      : appointment.expected_payment_method;

  return (
    <>
      <div className="fixed inset-0 z-40">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Cerrar panel"
          onClick={onClose}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="appointment-side-panel-title"
          className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l bg-background shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <h2 id="appointment-side-panel-title" className="truncate text-lg font-semibold">
                {SPECIES_EMOJI[appointment.patient_species]} {appointment.patient_name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {formatAppointmentDateTime(appointment.starts_at)}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}>
                {APPOINTMENT_STATUS_LABELS[appointment.status]}
              </Badge>
              {paymentLabel && (
                <Badge
                  variant={
                    appointment.expected_payment_method === 'gratuito' ? 'success' : 'default'
                  }
                >
                  {paymentLabel}
                </Badge>
              )}
              {waitingRoomStatus &&
                !(
                  appointment.expected_payment_method === 'gratuito' &&
                  waitingRoomStatus === 'payment_pending'
                ) && (
                  <Badge variant={WAITING_ROOM_STATUS_VARIANT[waitingRoomStatus]}>
                    SE · {WAITING_ROOM_STATUS_LABELS[waitingRoomStatus]}
                  </Badge>
                )}
            </div>

            <dl className="grid gap-3 text-sm">
              <Field
                label="Tipo"
                value={
                  appointment.title
                    ? `${APPOINTMENT_TYPE_LABELS[appointment.appointment_type]} · ${appointment.title}`
                    : APPOINTMENT_TYPE_LABELS[appointment.appointment_type]
                }
              />
              <Field label="Tutor" value={appointment.owner_full_name} />
              <Field label="Profesional" value={appointment.assigned_user_name ?? 'Sin asignar'} />
              {appointment.consultation_mode && (
                <Field
                  label="Modalidad"
                  value={
                    CONSULTATION_MODE_LABELS[appointment.consultation_mode as ConsultationMode] ??
                    appointment.consultation_mode
                  }
                />
              )}
              {appointment.room && <Field label="Consultorio" value={appointment.room} />}
              {paymentLabel && <Field label="Pago esperado" value={paymentLabel} />}
              {appointment.notes && <Field label="Notas" value={appointment.notes} />}
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/pacientes/${appointment.patient_id}/historia`}>
                  Historia clínica
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
              {canVaccination && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/vacunacion/nueva?patientId=${appointment.patient_id}`}>
                    Vacunación
                  </Link>
                </Button>
              )}
              {canBilling && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/facturacion/nueva?patientId=${appointment.patient_id}`}>
                    Facturación
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/agenda/${appointment.id}`}>
                  Ver detalle
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          {canWrite && (
            <div className="space-y-2 border-t px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <Button
                    key={action.next}
                    type="button"
                    size="sm"
                    variant={action.next === 'cancelada' ? 'destructive' : 'outline'}
                    isPending={pending}
                    onClick={() => handleStatusChange(action.next)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {canCheckIn && (
                  <Button type="button" size="sm" variant="outline" isPending={pending} onClick={handleCheckIn}>
                    <CalendarPlus className="h-4 w-4" />
                    Check-in
                  </Button>
                )}
                {canStartConsultation &&
                  appointment.status !== 'cancelada' &&
                  appointment.status !== 'ausente' && (
                    <Button type="button" size="sm" isPending={pending} onClick={handleStartConsultation}>
                      <Stethoscope className="h-4 w-4" />
                      Atender
                    </Button>
                  )}
                <Button type="button" size="sm" variant="outline" onClick={openReschedule}>
                  <CalendarClock className="h-4 w-4" />
                  Reprogramar
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/agenda/${appointment.id}/editar`}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  isPending={pending}
                  onClick={() => setDialog({ type: 'delete' })}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={dialog?.type === 'status'}
        title="Cambiar estado"
        description={
          dialog?.type === 'status'
            ? `¿Cambiar estado a "${APPOINTMENT_STATUS_LABELS[dialog.status]}"?`
            : ''
        }
        confirmLabel="Cambiar"
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.type === 'status') confirmStatus(dialog.status);
        }}
      />

      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Eliminar cita"
        description="¿Eliminar esta cita? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onClose={() => setDialog(null)}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={dialog?.type === 'alert'}
        mode="alert"
        title="No se pudo completar"
        description={dialog?.type === 'alert' ? dialog.message : ''}
        onClose={() => setDialog(null)}
      />

      <ModalShell
        open={cancelOpen}
        titleId="cancel-appointment-title"
        title="Cancelar cita"
        description="Podés indicar un motivo opcional."
        onClose={() => setCancelOpen(false)}
      >
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="side-cancel-reason">Motivo</Label>
            <Input
              id="side-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej. el tutor reprogramó"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              isPending={pending}
              onClick={() => {
                setCancelOpen(false);
                confirmStatus('cancelada', cancelReason || undefined);
              }}
            >
              Cancelar cita
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={rescheduleOpen}
        titleId="reschedule-appointment-title"
        title="Reprogramar cita"
        description="Elegí nueva fecha, hora y duración."
        onClose={() => setRescheduleOpen(false)}
      >
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="side-reschedule-starts">Fecha y hora</Label>
            <Input
              id="side-reschedule-starts"
              type="datetime-local"
              value={rescheduleStartsAt}
              onChange={(e) => setRescheduleStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="side-reschedule-duration">Duración (min)</Label>
            <Select
              id="side-reschedule-duration"
              value={rescheduleDuration}
              onChange={(e) => setRescheduleDuration(e.target.value)}
            >
              {APPOINTMENT_DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRescheduleOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" isPending={pending} onClick={handleReschedule}>
              Guardar
            </Button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value || '—'}</dd>
    </div>
  );
}
