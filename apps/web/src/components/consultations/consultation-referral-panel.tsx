'use client';

import { agendaMemberKey } from '@sincvete/shared';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createReferralFromConsultation } from '@/actions/appointments';
import {
  getProfessionalAgendaContext,
  type ProfessionalAgendaContext,
} from '@/actions/appointment-availability';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_APPOINTMENT_DURATION_MINUTES,
  buildLocalSlotsForDate,
  formatDateParam,
  getPreferredSlotDurationMinutes,
  toLocalDateTimeInput,
  type AssignableStaffMember,
  type ConsultationListRow,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

export function ConsultationReferralPanel({
  consultation,
  staff,
}: {
  consultation: ConsultationListRow;
  staff: AssignableStaffMember[];
}) {
  const [open, setOpen] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [selectedDate, setSelectedDate] = useState(formatDateParam(new Date()));
  const [startsAt, setStartsAt] = useState('');
  const [isOverbook, setIsOverbook] = useState(false);
  const [proContext, setProContext] = useState<ProfessionalAgendaContext | null>(null);
  const [proPending, setProPending] = useState(false);
  const [state, formAction, pending] = useActionState(createReferralFromConsultation, null);

  const others = useMemo(
    () =>
      staff.filter(
        (member) =>
          agendaMemberKey(member) && agendaMemberKey(member) !== consultation.veterinarian_id
      ),
    [staff, consultation.veterinarian_id]
  );

  useEffect(() => {
    if (!assignedUserId) {
      setProContext(null);
      return;
    }
    let cancelled = false;
    setProPending(true);
    void getProfessionalAgendaContext({
      userId: assignedUserId,
      branchId: consultation.branch_id,
    })
      .then((ctx) => {
        if (!cancelled) setProContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setProContext(null);
      })
      .finally(() => {
        if (!cancelled) setProPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedUserId, consultation.branch_id]);

  const schedules = useMemo(() => proContext?.schedules ?? [], [proContext]);
  const durationMinutes =
    getPreferredSlotDurationMinutes(schedules) ?? DEFAULT_APPOINTMENT_DURATION_MINUTES;
  const slots = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) || schedules.length === 0) return [];
    return buildLocalSlotsForDate({
      dateStr: selectedDate,
      schedules,
      durationMinutes,
      appointmentType: 'consulta',
    });
  }, [selectedDate, schedules, durationMinutes]);

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Derivar a otro profesional
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Derivar a otro profesional</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="consultationId" value={consultation.id} />
        <input type="hidden" name="patientId" value={consultation.patient_id} />
        <input type="hidden" name="ownerId" value={consultation.owner_id} />
        <input type="hidden" name="branchId" value={consultation.branch_id} />
        <input type="hidden" name="durationMinutes" value={String(durationMinutes)} />
        <input type="hidden" name="appointmentType" value="consulta" />
        <input type="hidden" name="startsAt" value={startsAt} />
        <input type="hidden" name="title" value={`Derivación · ${consultation.patient_name}`} />

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="referral-professional">Profesional</Label>
          <Select
            id="referral-professional"
            name="assignedUserId"
            required
            value={assignedUserId}
            onChange={(event) => {
              setAssignedUserId(event.target.value);
              setStartsAt('');
            }}
          >
            <option value="">Elegí un profesional…</option>
            {others.map((member) => (
              <option key={agendaMemberKey(member)} value={agendaMemberKey(member)}>
                {member.fullName}
                {member.specialty ? ` · ${member.specialty}` : ''}
              </option>
            ))}
          </Select>
          {others.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No hay otros profesionales con usuario de agenda en la clínica.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="referral-date">Día</Label>
          <Input
            id="referral-date"
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setStartsAt('');
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Horarios disponibles</Label>
          {proPending ? (
            <p className="text-xs text-muted-foreground">Cargando agenda…</p>
          ) : !assignedUserId ? (
            <p className="text-xs text-muted-foreground">Seleccioná un profesional</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin franjas ese día. Usá sobreturno o cambiá la fecha.
            </p>
          ) : (
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {slots.map((slot) => {
                const active = startsAt === slot.startsAtLocal;
                return (
                  <button
                    key={slot.startsAtLocal}
                    type="button"
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    )}
                    onClick={() => {
                      setIsOverbook(false);
                      setStartsAt(slot.startsAtLocal);
                    }}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-dashed border-border bg-background p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              name="isOverbook"
              checked={isOverbook}
              onChange={(event) => {
                setIsOverbook(event.target.checked);
                if (event.target.checked && !startsAt) {
                  setStartsAt(
                    `${selectedDate}T${toLocalDateTimeInput(new Date().toISOString()).slice(11, 16)}`
                  );
                }
              }}
            />
            Sobreturno
          </label>
          {isOverbook ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="referral-overbook-time">Fecha y hora del sobreturno</Label>
                <Input
                  id="referral-overbook-time"
                  type="datetime-local"
                  required={isOverbook}
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="referral-overbook-note">Motivo / detalle</Label>
                <Input
                  id="referral-overbook-note"
                  name="overbookNote"
                  placeholder="Ej. urgencia, control express"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="referral-notes">Notas para el profesional</Label>
          <Textarea
            id="referral-notes"
            name="notes"
            rows={2}
            placeholder="Resumen breve de la derivación…"
            defaultValue={
              [consultation.diagnosis, consultation.plan].filter(Boolean).join('\n') || ''
            }
          />
        </div>

        {state?.error ? (
          <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>
        ) : null}
        {state?.success && state.data?.appointmentId ? (
          <p className="text-sm text-emerald-600 sm:col-span-2">
            Derivación creada.{' '}
            <Link className="underline" href={`/agenda/${state.data.appointmentId}`}>
              Ver turno
            </Link>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            type="submit"
            disabled={pending || !assignedUserId || !startsAt}
            isPending={pending}
          >
            {pending ? 'Derivando…' : 'Confirmar derivación'}
          </Button>
        </div>
      </form>
    </div>
  );
}
