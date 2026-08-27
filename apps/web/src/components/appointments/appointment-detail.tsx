'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarPlus, MessageCircle, Pencil, Stethoscope, Trash2 } from 'lucide-react';
import { deleteAppointment, updateAppointmentStatus } from '@/actions/appointments';
import { startConsultationFromAppointment } from '@/actions/consultations';
import { checkInAppointment } from '@/actions/waiting-room';
import { WaitingRoomCheckInQrButton } from '@/components/waiting-room/waiting-room-check-in-qr-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  APPOINTMENT_TYPE_LABELS,
  CONSULTATION_MODE_LABELS,
  PAYMENT_METHOD_LABELS,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  formatAppointmentDateTime,
  SPECIES_EMOJI,
  buildWhatsAppComposePath,
  type AppointmentListRow,
  type AppointmentStatus,
  type AppointmentStatusEvent,
  type ConsultationMode,
  type PaymentMethod,
  type SettlementSourceClaimInfo,
  type WaitingRoomStatus,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface AppointmentDetailProps {
  appointment: AppointmentListRow;
  canWrite: boolean;
  canStartConsultation?: boolean;
  canSendWhatsApp?: boolean;
  canCheckInWaitingRoom?: boolean;
  consultationId?: string | null;
  waitingRoomStatus?: WaitingRoomStatus | null;
  settlementClaim?: SettlementSourceClaimInfo | null;
  settlementDetailBasePath?: string;
  statusEvents?: AppointmentStatusEvent[];
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

export function AppointmentDetail({
  appointment,
  canWrite,
  canStartConsultation = false,
  canSendWhatsApp = false,
  canCheckInWaitingRoom = false,
  consultationId = null,
  waitingRoomStatus = null,
  settlementClaim = null,
  settlementDetailBasePath = '/liquidaciones',
  statusEvents = [],
}: AppointmentDetailProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const actions = STATUS_ACTIONS[appointment.status] ?? [];
  const canCheckIn =
    canCheckInWaitingRoom &&
    appointment.status !== 'cancelada' &&
    appointment.status !== 'completada' &&
    appointment.status !== 'ausente';

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
      const result = await updateAppointmentStatus(appointment.id, status, reason);
      if (!result.success) {
        setDialog({ type: 'alert', message: result.error ?? 'No se pudo actualizar el estado' });
        return;
      }
      router.refresh();
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

  const handleDelete = () => {
    void runPending(async () => {
      const result = await deleteAppointment(appointment.id);
      if (!result.success) {
        setDialog({ type: 'alert', message: result.error ?? 'No se pudo eliminar la cita' });
        return;
      }
      if (result.success) router.push('/agenda');
    });
  };

  const paymentLabel =
    appointment.expected_payment_method &&
    appointment.expected_payment_method in PAYMENT_METHOD_LABELS
      ? PAYMENT_METHOD_LABELS[appointment.expected_payment_method as PaymentMethod]
      : appointment.expected_payment_method;

  return (
    <div className="space-y-4">
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
        titleId="detail-cancel-title"
        title="Cancelar cita"
        description="Podés indicar un motivo opcional."
        onClose={() => setCancelOpen(false)}
      >
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="detail-cancel-reason">Motivo</Label>
            <Input
              id="detail-cancel-reason"
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/agenda">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canSendWhatsApp && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={buildWhatsAppComposePath({
                  ownerId: appointment.owner_id,
                  patientId: appointment.patient_id,
                  appointmentId: appointment.id,
                  template: 'recordatorio_cita',
                })}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Link>
            </Button>
          )}
          {canCheckIn && (
            <>
              <WaitingRoomCheckInQrButton
                appointmentId={appointment.id}
                patientName={appointment.patient_name}
              />
              <Button variant="outline" size="sm" isPending={pending} onClick={handleCheckIn}>
                <CalendarPlus className="h-4 w-4" />
                {pending ? 'Ingresando...' : 'Check-in'}
              </Button>
            </>
          )}
          {consultationId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${consultationId}`}>
                <Stethoscope className="mr-2 h-4 w-4" />
                Ver consulta
              </Link>
            </Button>
          ) : (
            canStartConsultation &&
            appointment.status !== 'cancelada' &&
            appointment.status !== 'ausente' && (
              <Button size="sm" isPending={pending} onClick={handleStartConsultation}>
                <Stethoscope className="h-4 w-4" />
                {pending ? 'Iniciando...' : 'Atender'}
              </Button>
            )
          )}
          {canStartConsultation &&
            appointment.appointment_type === 'cirugia' &&
            appointment.status !== 'cancelada' &&
            appointment.status !== 'ausente' && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/cirugias/nueva?patientId=${appointment.patient_id}&appointmentId=${appointment.id}`}
                >
                  Programar cirugía
                </Link>
              </Button>
            )}
          {canWrite && (
            <>
              {actions.map((action) => (
                <Button
                  key={action.next}
                  variant={action.next === 'cancelada' ? 'destructive' : 'outline'}
                  size="sm"
                  isPending={pending}
                  onClick={() => handleStatusChange(action.next)}
                >
                  {pending ? 'Guardando...' : action.label}
                </Button>
              ))}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/agenda/${appointment.id}/editar`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDialog({ type: 'delete' })}
                isPending={pending}
              >
                {pending ? (
                  'Eliminando...'
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {settlementClaim ? (
        <SettlementSourceBadge
          claim={settlementClaim}
          detailHref={`${settlementDetailBasePath}/${settlementClaim.settlementId}`}
        />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{appointment.title || APPOINTMENT_TYPE_LABELS[appointment.appointment_type]}</CardTitle>
            <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}>
              {APPOINTMENT_STATUS_LABELS[appointment.status]}
            </Badge>
            {waitingRoomStatus && (
              <Badge variant={WAITING_ROOM_STATUS_VARIANT[waitingRoomStatus]}>
                SE · {WAITING_ROOM_STATUS_LABELS[waitingRoomStatus]}
              </Badge>
            )}
          </div>
          {waitingRoomStatus && (
            <p className="mt-2 text-sm text-muted-foreground">
              En sala de espera ·{' '}
              <Link href="/sala-espera" className="text-primary hover:underline">
                Ver cola
              </Link>
            </p>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Fecha y hora"
            value={formatAppointmentDateTime(appointment.starts_at)}
          />
          <DetailField
            label="Tipo"
            value={APPOINTMENT_TYPE_LABELS[appointment.appointment_type]}
          />
          <DetailField
            label="Paciente"
            value={
              <Link href={`/pacientes/${appointment.patient_id}`} className="text-primary hover:underline">
                {SPECIES_EMOJI[appointment.patient_species]} {appointment.patient_name}
              </Link>
            }
          />
          <DetailField
            label="Propietario"
            value={
              <Link href={`/propietarios/${appointment.owner_id}`} className="text-primary hover:underline">
                {appointment.owner_full_name}
              </Link>
            }
          />
          <DetailField label="Profesional" value={appointment.assigned_user_name} />
          {appointment.consultation_mode && (
            <DetailField
              label="Modalidad"
              value={
                CONSULTATION_MODE_LABELS[appointment.consultation_mode as ConsultationMode] ??
                appointment.consultation_mode
              }
            />
          )}
          {appointment.room && <DetailField label="Consultorio" value={appointment.room} />}
          {paymentLabel && <DetailField label="Pago esperado" value={paymentLabel} />}
          <DetailField
            label="Recordatorios"
            value={[
              appointment.remind_24h ? '24 h' : null,
              appointment.remind_2h ? '2 h' : null,
              appointment.remind_confirmation ? 'Confirmación' : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Ninguno'}
          />
          {appointment.cancellation_reason && (
            <DetailField label="Motivo cancelación" value={appointment.cancellation_reason} />
          )}
          {appointment.notes && (
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={appointment.notes} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Link
              href={`/pacientes/${appointment.patient_id}/historia`}
              className="text-sm text-primary hover:underline"
            >
              Ver historia clínica
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de estados</CardTitle>
        </CardHeader>
        <CardContent>
          {statusEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
          ) : (
            <ol className="space-y-3">
              {statusEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-muted pl-3">
                  <p className="text-sm font-medium">
                    {event.from_status
                      ? `${APPOINTMENT_STATUS_LABELS[event.from_status]} → ${APPOINTMENT_STATUS_LABELS[event.to_status]}`
                      : APPOINTMENT_STATUS_LABELS[event.to_status]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatAppointmentDateTime(event.created_at)}
                    {event.note ? ` · ${event.note}` : ''}
                  </p>
                  {(event.new_starts_at || event.previous_starts_at) && (
                    <p className="text-xs text-muted-foreground">
                      Horario
                      {event.previous_starts_at
                        ? ` ${formatAppointmentDateTime(event.previous_starts_at)}`
                        : ''}
                      {event.new_starts_at
                        ? ` → ${formatAppointmentDateTime(event.new_starts_at)}`
                        : ''}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{value || '—'}</div>
    </div>
  );
}
