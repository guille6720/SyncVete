'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Hourglass } from 'lucide-react';
import { getOwnerPortalWaitingRoom } from '@/actions/portal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  APPOINTMENT_TYPE_LABELS,
  PORTAL_WAITING_ROOM_STATUS_MESSAGES,
  SPECIES_EMOJI,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  estimatePortalWaitingMinutes,
  formatAppointmentTime,
  formatPortalWaitingEta,
  type PortalWaitingRoomRow,
} from '@sincvete/shared';

interface PortalWaitingRoomBoardProps {
  initialEntries: PortalWaitingRoomRow[];
  today: string;
  compact?: boolean;
}

export function PortalWaitingRoomBoard({
  initialEntries,
  today,
  compact = false,
}: PortalWaitingRoomBoardProps) {
  const [entries, setEntries] = useState(initialEntries);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const refresh = useCallback(async () => {
    try {
      const next = await getOwnerPortalWaitingRoom(today);
      setEntries(next);
    } catch (error) {
      console.error('[portal waiting-room] refresh failed', error);
    }
  }, [today]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 12_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const active = entries.filter((row) => row.waiting_room_status !== 'completed');
  const completed = entries.filter((row) => row.waiting_room_status === 'completed');

  if (compact) {
    if (active.length === 0) return null;
    return (
      <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-lg">
            <span className="flex items-center gap-2">
              <Hourglass className="h-4 w-4" />
              Sala de espera
            </span>
            <Link href="/portal/sala-espera" className="text-sm font-normal text-primary hover:underline">
              Ver detalle
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.slice(0, 3).map((row) => (
            <PortalWaitingRoomCard key={row.waiting_room_entry_id} row={row} />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">
            Ninguna de tus mascotas está en sala de espera hoy.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((row) => (
            <PortalWaitingRoomCard key={row.waiting_room_entry_id} row={row} emphasize />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Completados hoy</h3>
          {completed.map((row) => (
            <PortalWaitingRoomCard key={row.waiting_room_entry_id} row={row} />
          ))}
        </section>
      )}
    </div>
  );
}

function PortalWaitingRoomCard({
  row,
  emphasize = false,
}: {
  row: PortalWaitingRoomRow;
  emphasize?: boolean;
}) {
  const called = row.waiting_room_status === 'called';
  const message = PORTAL_WAITING_ROOM_STATUS_MESSAGES[row.waiting_room_status];
  const etaMinutes =
    row.waiting_room_status === 'waiting'
      ? estimatePortalWaitingMinutes(row.ahead_count)
      : null;
  const etaLabel = formatPortalWaitingEta(etaMinutes);

  return (
    <div
      className={`rounded-lg border p-4 ${
        called
          ? 'border-emerald-400 bg-emerald-50 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/40'
          : emphasize
            ? 'bg-card'
            : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {SPECIES_EMOJI[row.patient_species]} {row.patient_name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {APPOINTMENT_TYPE_LABELS[row.appointment_type]} · turno{' '}
            {formatAppointmentTime(row.appointment_starts_at)}
          </p>
          <p className={`mt-2 text-sm ${called ? 'font-semibold text-emerald-800 dark:text-emerald-200' : ''}`}>
            {message}
            {called && row.room ? ` · Consultorio ${row.room}` : ''}
          </p>
          {row.waiting_room_status === 'waiting' && row.ahead_count > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {row.ahead_count === 1
                ? 'Hay 1 paciente delante'
                : `Hay ${row.ahead_count} pacientes delante`}
              {etaLabel ? ` · ${etaLabel}` : ''}
            </p>
          )}
          {row.waiting_room_status === 'waiting' && row.ahead_count === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Sos el próximo en la cola
              {etaLabel ? ` · ${etaLabel}` : ''}
            </p>
          )}
        </div>
        <Badge variant={WAITING_ROOM_STATUS_VARIANT[row.waiting_room_status]}>
          {WAITING_ROOM_STATUS_LABELS[row.waiting_room_status]}
        </Badge>
      </div>
    </div>
  );
}
