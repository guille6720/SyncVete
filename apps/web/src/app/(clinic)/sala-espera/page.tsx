import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MonitorPlay,
  TabletSmartphone,
} from 'lucide-react';
import {
  addDaysIso,
  formatDateParam,
  formatDashboardDate,
  getWeekStartDate,
  parseDateParam,
  type AppointmentListRow,
} from '@sincvete/shared';
import { listAppointments } from '@/actions/appointments';
import {
  canManageWaitingRoom,
  canReadWaitingRoom,
  listWaitingRoom,
} from '@/actions/waiting-room';
import { canManageConsultations } from '@/actions/consultations';
import { canSendWhatsApp } from '@/actions/whatsapp';
import { WaitingRoomBoard } from '@/components/waiting-room/waiting-room-board';
import { WaitingRoomOpsDashboard } from '@/components/waiting-room/waiting-room-ops-dashboard';
import { Button } from '@/components/ui/button';

interface SalaEsperaPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function SalaEsperaPage({ searchParams }: SalaEsperaPageProps) {
  const canRead = await canReadWaitingRoom();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const today = formatDateParam(new Date());
  const selectedDate = parseDateParam(params.date);
  const isToday = selectedDate === today;
  const prevDate = addDaysIso(selectedDate, -1);
  const nextDate = addDaysIso(selectedDate, 1);
  const weekStart = getWeekStartDate(selectedDate);

  const [canWrite, canWhatsApp, canStartConsultation] = await Promise.all([
    canManageWaitingRoom(),
    canSendWhatsApp(),
    canManageConsultations(),
  ]);

  const [entries, weekAppointments] = await Promise.all([
    listWaitingRoom({ date: selectedDate }),
    isToday
      ? listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[])
      : Promise.resolve([] as AppointmentListRow[]),
  ]);

  const checkedInIds = new Set(entries.map((row) => row.appointment_id));
  const checkInCandidates = isToday
    ? weekAppointments.filter((appointment) => {
        if (checkedInIds.has(appointment.id)) return false;
        const day = formatDateParam(new Date(appointment.starts_at));
        if (day !== today) return false;
        return (
          appointment.status === 'programada' ||
          appointment.status === 'confirmada' ||
          appointment.status === 'en_curso'
        );
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sala de espera</h1>
          <p className="text-muted-foreground">
            Cola operativa · check-in, llamados y seguimiento de atención
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/sala-espera/tablero" target="_blank" rel="noreferrer">
              <LayoutDashboard className="h-4 w-4" />
              Tablero
            </Link>
          </Button>
          {canWrite && (
            <Button variant="outline" asChild>
              <Link href="/sala-espera/kiosco" target="_blank" rel="noreferrer">
                <TabletSmartphone className="h-4 w-4" />
                Kiosco
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/sala-espera/pantalla" target="_blank" rel="noreferrer">
              <MonitorPlay className="h-4 w-4" />
              Pantalla TV
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/sala-espera?date=${prevDate}`} aria-label="Día anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <p className="min-w-[10rem] text-center text-sm font-medium capitalize">
          {formatDashboardDate(`${selectedDate}T12:00:00-03:00`)}
          {isToday ? ' · Hoy' : ''}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/sala-espera?date=${nextDate}`} aria-label="Día siguiente">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sala-espera">Hoy</Link>
          </Button>
        )}
      </div>

      <WaitingRoomOpsDashboard
        entries={entries}
        pendingCheckInCount={checkInCandidates.length}
        today={selectedDate}
      />

      <WaitingRoomBoard
        entries={entries}
        checkInCandidates={checkInCandidates}
        canWrite={canWrite}
        canSendWhatsApp={canWhatsApp}
        canStartConsultation={canStartConsultation}
        todayLabel={selectedDate}
        isToday={isToday}
      />
    </div>
  );
}
