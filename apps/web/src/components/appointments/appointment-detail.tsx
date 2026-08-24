'use client';

import type { ReactNode } from 'react';
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
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  APPOINTMENT_TYPE_LABELS,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  formatAppointmentDateTime,
  SPECIES_EMOJI,
  buildWhatsAppComposePath,
  type AppointmentListRow,
  type AppointmentStatus,
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

export function AppointmentDetail({
  appointment,
  canWrite,
  canStartConsultation = false,
  canSendWhatsApp = false,
  canCheckInWaitingRoom = false,
  consultationId = null,
  waitingRoomStatus = null,
  settlementClaim = null,
}: AppointmentDetailProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const actions = STATUS_ACTIONS[appointment.status] ?? [];
  const canCheckIn =
    canCheckInWaitingRoom &&
    appointment.status !== 'cancelada' &&
    appointment.status !== 'completada' &&
    appointment.status !== 'ausente';

  const handleStatusChange = (status: AppointmentStatus) => {
    if (status === 'cancelada') {
      const reason = prompt('Motivo de cancelación (opcional)');
      if (reason === null) return;
      void runPending(async () => {
        await updateAppointmentStatus(appointment.id, status, reason || undefined);
        router.refresh();
      });
      return;
    }

    if (!confirm(`¿Cambiar estado a "${APPOINTMENT_STATUS_LABELS[status]}"?`)) return;
    void runPending(async () => {
      await updateAppointmentStatus(appointment.id, status);
      router.refresh();
    });
  };

  const handleStartConsultation = () => {
    void runPending(async () => {
      const result = await startConsultationFromAppointment(appointment.id);
      if (result && !result.success) {
        alert(result.error ?? 'No se pudo iniciar la consulta');
      }
    });
  };

  const handleCheckIn = () => {
    void runPending(async () => {
      const result = await checkInAppointment(appointment.id);
      if (!result.success) {
        alert(result.error ?? 'No se pudo hacer check-in');
        return;
      }
      router.push('/sala-espera');
    });
  };

  const handleDelete = () => {
    if (!confirm('¿Eliminar esta cita?')) return;
    void runPending(async () => {
      const result = await deleteAppointment(appointment.id);
      if (result.success) router.push('/agenda');
    });
  };

  return (
    <div className="space-y-4">
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
                onClick={handleDelete}
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

      {settlementClaim ? <SettlementSourceBadge claim={settlementClaim} /> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{appointment.title || APPOINTMENT_TYPE_LABELS[appointment.appointment_type]}</CardTitle>
            <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}>
              {APPOINTMENT_STATUS_LABELS[appointment.status]}
            </Badge>
            {waitingRoomStatus && (
              <Badge variant={WAITING_ROOM_STATUS_VARIANT[waitingRoomStatus]}>
                {WAITING_ROOM_STATUS_LABELS[waitingRoomStatus]}
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
          {appointment.cancellation_reason && (
            <DetailField label="Motivo cancelación" value={appointment.cancellation_reason} />
          )}
          {appointment.notes && (
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={appointment.notes} />
            </div>
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
