import { notFound, redirect } from 'next/navigation';
import { formatDateParam, buildSettlementDetailBasePath } from '@sincvete/shared';
import {
  getAppointment,
  canReadAppointments,
  canManageAppointments,
  listAppointmentStatusEvents,
} from '@/actions/appointments';
import { canManageConsultations, getConsultationByAppointment } from '@/actions/consultations';
import { canSendWhatsApp } from '@/actions/whatsapp';
import { canManageWaitingRoom, canReadWaitingRoom, listWaitingRoom } from '@/actions/waiting-room';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { AppointmentDetail } from '@/components/appointments/appointment-detail';

interface CitaPageProps {
  params: Promise<{ id: string }>;
}

export default async function CitaDetailPage({ params }: CitaPageProps) {
  const canRead = await canReadAppointments();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [appointment, canWrite, canStart, existingConsultation, canWhatsApp, canCheckIn, canReadWr, settlementAccess] =
    await Promise.all([
      getAppointment(id),
      canManageAppointments(),
      canManageConsultations(),
      getConsultationByAppointment(id).catch(() => null),
      canSendWhatsApp(),
      canManageWaitingRoom(),
      canReadWaitingRoom(),
      canReadSettlementSourceClaims(),
    ]);

  if (!appointment) notFound();

  const [settlementClaim, statusEvents] = await Promise.all([
    settlementAccess && appointment.status === 'completada'
      ? getSettlementClaimForSource('appointment', appointment.id)
      : Promise.resolve(null),
    listAppointmentStatusEvents(id).catch(() => []),
  ]);
  const settlementDetailBasePath = buildSettlementDetailBasePath(settlementAccess);

  let waitingRoomStatus = null;
  if (canReadWr) {
    const day = formatDateParam(new Date(appointment.starts_at));
    const entries = await listWaitingRoom({ date: day });
    waitingRoomStatus =
      entries.find((entry) => entry.appointment_id === appointment.id)?.waiting_room_status ?? null;
  }

  return (
    <AppointmentDetail
      appointment={appointment}
      canWrite={canWrite}
      canStartConsultation={canStart}
      canSendWhatsApp={canWhatsApp}
      canCheckInWaitingRoom={canCheckIn}
      consultationId={existingConsultation?.id ?? null}
      waitingRoomStatus={waitingRoomStatus}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
      statusEvents={statusEvents}
    />
  );
}
