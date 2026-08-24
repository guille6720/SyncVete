import { redirect } from 'next/navigation';
import {
  formatDateParam,
  getWeekStartDate,
  type AppointmentListRow,
} from '@sincvete/shared';
import { listAppointments } from '@/actions/appointments';
import {
  canManageWaitingRoom,
  canReadWaitingRoom,
  listWaitingRoom,
} from '@/actions/waiting-room';
import { WaitingRoomBoard } from '@/components/waiting-room/waiting-room-board';

export default async function SalaEsperaPage() {
  const canRead = await canReadWaitingRoom();
  if (!canRead) redirect('/dashboard');

  const today = formatDateParam(new Date());
  const weekStart = getWeekStartDate(today);
  const canWrite = await canManageWaitingRoom();

  const [entries, weekAppointments] = await Promise.all([
    listWaitingRoom({ date: today }),
    listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[]),
  ]);

  const checkedInIds = new Set(entries.map((row) => row.appointment_id));
  const checkInCandidates = weekAppointments.filter((appointment) => {
    if (checkedInIds.has(appointment.id)) return false;
    const day = formatDateParam(new Date(appointment.starts_at));
    if (day !== today) return false;
    return (
      appointment.status === 'programada' ||
      appointment.status === 'confirmada' ||
      appointment.status === 'en_curso'
    );
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sala de espera</h1>
        <p className="text-muted-foreground">
          Cola operativa del día · check-in, llamados y seguimiento de atención
        </p>
      </div>

      <WaitingRoomBoard
        entries={entries}
        checkInCandidates={checkInCandidates}
        canWrite={canWrite}
        todayLabel={today}
      />
    </div>
  );
}
