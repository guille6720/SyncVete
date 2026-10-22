'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sendReminder, skipReminder } from '@/actions/reminders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  REMINDER_TYPE_LABELS,
  VACCINATION_DUE_STATUS_LABELS,
  VACCINATION_DUE_STATUS_VARIANT,
  formatDashboardDateTime,
  formatMoney,
  formatVaccinationDate,
  reminderHasPhone,
  type AppointmentStatus,
  type AppointmentType,
  type ReminderBoard,
  type ReminderItem,
  type ReminderType,
  type VaccinationDueStatus,
} from '@sincvete/shared';

interface RemindersBoardProps {
  board: ReminderBoard;
  canSend: boolean;
  branchName?: string | null;
}

function entityHref(item: ReminderItem): string {
  if (item.reminder_type === 'appointment') return `/agenda/${item.related_id}`;
  if (item.reminder_type === 'vaccination') return `/vacunacion/${item.related_id}`;
  return `/facturacion/${item.related_id}`;
}

function itemSubtitle(item: ReminderItem): string {
  if (item.reminder_type === 'appointment') {
    const typeLabel =
      item.appointment_type && item.appointment_type in APPOINTMENT_TYPE_LABELS
        ? APPOINTMENT_TYPE_LABELS[item.appointment_type as AppointmentType]
        : item.title;
    const statusLabel =
      item.appointment_status && item.appointment_status in APPOINTMENT_STATUS_LABELS
        ? APPOINTMENT_STATUS_LABELS[item.appointment_status as AppointmentStatus]
        : null;
    return [typeLabel, statusLabel, formatDashboardDateTime(item.due_at)].filter(Boolean).join(' · ');
  }

  if (item.reminder_type === 'vaccination') {
    return `Refuerzo ${formatVaccinationDate(item.due_at)}`;
  }

  const amount =
    item.balance != null ? formatMoney(item.balance, item.currency ?? 'ARS') : null;
  return [item.invoice_number, amount].filter(Boolean).join(' · ');
}

function ReminderRow({
  item,
  canSend,
  busyKey,
  error,
  onSend,
  onSkip,
}: {
  item: ReminderItem;
  canSend: boolean;
  busyKey: string | null;
  error: string | null;
  onSend: (item: ReminderItem) => void;
  onSkip: (item: ReminderItem) => void;
}) {
  const key = `${item.reminder_type}:${item.related_id}`;
  const pending = busyKey === key;
  const hasPhone = reminderHasPhone(item);
  const dueStatus = item.due_status as VaccinationDueStatus | null;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={entityHref(item)} className="font-medium hover:underline">
              {item.patient_name ?? item.title}
            </Link>
            {dueStatus && dueStatus in VACCINATION_DUE_STATUS_LABELS && (
              <Badge variant={VACCINATION_DUE_STATUS_VARIANT[dueStatus]}>
                {VACCINATION_DUE_STATUS_LABELS[dueStatus]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.owner_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{itemSubtitle(item)}</p>
          {item.reminder_type === 'vaccination' && item.vaccine_name && (
            <p className="mt-1 text-sm">{item.vaccine_name}</p>
          )}
        </div>
        {canSend && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !hasPhone}
              onClick={() => onSend(item)}
            >
              {pending ? 'Abriendo...' : 'WhatsApp'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onSkip(item)}
            >
              Omitir
            </Button>
          </div>
        )}
      </div>
      {canSend && !hasPhone && (
        <p className="mt-2 text-xs text-muted-foreground">Sin teléfono de WhatsApp</p>
      )}
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

function ReminderSection({
  type,
  items,
  description,
  canSend,
  busyKey,
  errorKey,
  error,
  onSend,
  onSkip,
}: {
  type: ReminderType;
  items: ReminderItem[];
  description: string;
  canSend: boolean;
  busyKey: string | null;
  errorKey: string | null;
  error: string | null;
  onSend: (item: ReminderItem) => void;
  onSkip: (item: ReminderItem) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{REMINDER_TYPE_LABELS[type]}</CardTitle>
        <CardDescription>
          {items.length} pendiente{items.length !== 1 ? 's' : ''} · {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay avisos pendientes en esta sucursal.</p>
        ) : (
          items.map((item) => (
            <ReminderRow
              key={`${item.reminder_type}:${item.related_id}`}
              item={item}
              canSend={canSend}
              busyKey={busyKey}
              error={errorKey === `${item.reminder_type}:${item.related_id}` ? error : null}
              onSend={onSend}
              onSkip={onSkip}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function RemindersBoard({ board, canSend, branchName = null }: RemindersBoardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipItem, setSkipItem] = useState<ReminderItem | null>(null);

  const run = (item: ReminderItem, action: 'send' | 'skip') => {
    const key = `${item.reminder_type}:${item.related_id}`;
    setBusyKey(key);
    setError(null);
    startTransition(async () => {
      const result =
        action === 'send'
          ? await sendReminder({
              reminderType: item.reminder_type,
              relatedId: item.related_id,
            })
          : await skipReminder({
              reminderType: item.reminder_type,
              relatedId: item.related_id,
            });

      if (!result.success) {
        setError(result.error ?? 'No se pudo actualizar el recordatorio');
        setErrorKey(key);
        setBusyKey(null);
        return;
      }

      if (action === 'send' && 'url' in (result.data ?? {}) && result.data?.url) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      }

      setBusyKey(null);
      setErrorKey(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={Boolean(skipItem)}
        title="Omitir recordatorio"
        description="¿Omitir este aviso? No volverá a aparecer en la cola pendiente."
        confirmLabel="Omitir"
        variant="destructive"
        onClose={() => setSkipItem(null)}
        onConfirm={() => {
          if (skipItem) run(skipItem, 'skip');
        }}
      />
      {branchName ? (
        <p className="text-sm text-muted-foreground">Cola de la sucursal {branchName}</p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
      <ReminderSection
        type="appointment"
        items={board.appointments}
        description="próximas 48 h"
        canSend={canSend}
        busyKey={busyKey}
        errorKey={errorKey}
        error={error}
        onSend={(item) => run(item, 'send')}
        onSkip={(item) => setSkipItem(item)}
      />
      <ReminderSection
        type="vaccination"
        items={board.vaccinations}
        description="vencidas o a 30 días"
        canSend={canSend}
        busyKey={busyKey}
        errorKey={errorKey}
        error={error}
        onSend={(item) => run(item, 'send')}
        onSkip={(item) => setSkipItem(item)}
      />
      <ReminderSection
        type="invoice"
        items={board.invoices}
        description="facturas con saldo"
        canSend={canSend}
        busyKey={busyKey}
        errorKey={errorKey}
        error={error}
        onSend={(item) => run(item, 'send')}
        onSkip={(item) => setSkipItem(item)}
      />
      </div>
    </div>
  );
}
