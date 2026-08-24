import { redirect } from 'next/navigation';
import {
  formatDateParam,
  getWeekStartDate,
  type AppointmentListRow,
} from '@sincvete/shared';
import { getSessionContext } from '@/lib/session';
import { listAppointments } from '@/actions/appointments';
import {
  canManageWaitingRoom,
  listWaitingRoom,
} from '@/actions/waiting-room';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { WaitingRoomKiosk } from '@/components/waiting-room/waiting-room-kiosk';

export default async function SalaEsperaKioscoPage() {
  const canWrite = await canManageWaitingRoom();
  if (!canWrite) redirect('/sala-espera');

  const session = await getSessionContext();
  if (!session) redirect('/login');

  const today = formatDateParam(new Date());
  const weekStart = getWeekStartDate(today);

  const [entries, weekAppointments, organization, branches] = await Promise.all([
    listWaitingRoom({ date: today }),
    listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[]),
    getOrganization(),
    getUserBranches(),
  ]);

  const checkedInIds = new Set(entries.map((row) => row.appointment_id));
  const candidates = weekAppointments.filter((appointment) => {
    if (checkedInIds.has(appointment.id)) return false;
    const day = formatDateParam(new Date(appointment.starts_at));
    if (day !== today) return false;
    return (
      appointment.status === 'programada' ||
      appointment.status === 'confirmada' ||
      appointment.status === 'en_curso'
    );
  });

  const branchName =
    branches.find((b) => b.id === session.branchId)?.name ??
    branches.find((b) => b.is_main)?.name ??
    null;

  return (
    <WaitingRoomKiosk
      initialCandidates={candidates}
      clinicName={organization?.name ?? 'Clínica'}
      branchName={branchName}
      today={today}
    />
  );
}
