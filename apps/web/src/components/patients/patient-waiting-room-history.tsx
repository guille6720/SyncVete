import Link from 'next/link';
import { Hourglass } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  formatAppointmentTime,
  formatWaitMinutes,
  getPatientWaitingRoomActiveEntry,
  isWaitingRoomStatus,
  type PatientWaitingRoomHistoryRow,
  type WaitingRoomStatus,
} from '@sincvete/shared';

interface PatientWaitingRoomHistoryProps {
  history: PatientWaitingRoomHistoryRow[];
}

function waitingRoomHistoryStatusLabel(status: WaitingRoomStatus | string): string {
  return isWaitingRoomStatus(String(status))
    ? WAITING_ROOM_STATUS_LABELS[status as WaitingRoomStatus]
    : String(status);
}

function waitingRoomHistoryStatusVariant(
  status: WaitingRoomStatus | string
): 'default' | 'success' | 'warning' | 'destructive' {
  return isWaitingRoomStatus(String(status))
    ? WAITING_ROOM_STATUS_VARIANT[status as WaitingRoomStatus]
    : 'default';
}

export function PatientWaitingRoomHistory({ history }: PatientWaitingRoomHistoryProps) {
  if (history.length === 0) return null;

  const active = getPatientWaitingRoomActiveEntry(history);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Hourglass className="h-4 w-4" />
          Sala de espera
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sala-espera">Ver cola</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {active && (
          <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2.5 dark:border-teal-900 dark:bg-teal-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">En cola ahora</p>
              <Badge variant={waitingRoomHistoryStatusVariant(active.waiting_room_status)}>
                {waitingRoomHistoryStatusLabel(active.waiting_room_status)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Check-in {formatAppointmentTime(active.checked_in_at)}
              {active.room ? ` · ${active.room}` : ''}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Visitas recientes
          </p>
          <ul className="space-y-2">
            {history.map((row) => (
              <li
                key={row.waiting_room_entry_id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {formatAppointmentTime(row.checked_in_at)}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · turno {formatAppointmentTime(row.appointment_starts_at)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.minutes_to_call != null
                      ? `Hasta llamado ${formatWaitMinutes(row.minutes_to_call)}`
                      : 'Sin llamado'}
                    {row.minutes_dwell != null
                      ? ` · permanencia ${formatWaitMinutes(row.minutes_dwell)}`
                      : ''}
                    {row.removed ? ' · quitado de cola' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={waitingRoomHistoryStatusVariant(row.waiting_room_status)}>
                    {waitingRoomHistoryStatusLabel(row.waiting_room_status)}
                  </Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/agenda/${row.appointment_id}`}>Cita</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
