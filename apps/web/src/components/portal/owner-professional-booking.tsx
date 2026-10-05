'use client';

import { useActionState, useState } from 'react';
import { bookOwnerProfessionalSlot, type OwnerProfessionalAvailability } from '@/actions/owner-app';
import type { PortalPatientSummary } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export function OwnerProfessionalBooking({
  availability,
  patients,
  initialProfessionalId,
}: {
  availability: OwnerProfessionalAvailability;
  patients: PortalPatientSummary[];
  initialProfessionalId?: string;
}) {
  const [professionalId, setProfessionalId] = useState(
    availability.professionals.find((p) => p.id === initialProfessionalId)?.id ||
      availability.professionals[0]?.id ||
      ''
  );
  const [state, action, pending] = useActionState(bookOwnerProfessionalSlot, null);
  const slots = availability.slots.filter((slot) => slot.professional_id === professionalId);
  const alive = patients.filter((pet) => !pet.isDeceased);
  const [selectedKey, setSelectedKey] = useState('');
  const slot = slots.find((s) => `${s.schedule_id}:${s.starts_at}` === selectedKey) || slots[0];
  const time = (date: string) =>
    new Intl.DateTimeFormat('es-AR', {
      timeZone: availability.timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  return (
    <section className="space-y-5 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">Solicitar turno</h2>
      {availability.professionals.length ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="ownerProfessional">Profesional</Label>
            <Select
              id="ownerProfessional"
              value={professionalId}
              onChange={(event) => {
                setProfessionalId(event.target.value);
                setSelectedKey('');
              }}
            >
              {availability.professionals.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                  {p.specialty ? ` · ${p.specialty}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <form method="get" action="/portal/turnos" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="professional" value={professionalId} />
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="ownerDate">Fecha</Label>
              <Input
                type="date"
                name="date"
                id="ownerDate"
                required
                defaultValue={availability.date}
                min={availability.minDate}
                max={availability.maxDate}
              />
            </div>
            <Button type="submit" variant="outline">
              Ver horarios
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Horarios de la veterinaria, hora de Argentina.
          </p>
          {slots.length && alive.length ? (
            <form action={action} className="space-y-4">
              <input type="hidden" name="scheduleId" value={slot.schedule_id} />
              <input type="hidden" name="startsAt" value={slot.starts_at} />
              <div className="space-y-2">
                <Label htmlFor="bookingPatient">Mascota</Label>
                <Select id="bookingPatient" name="patientId" required>
                  {alive.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bookingTime">Horario disponible</Label>
                <Select
                  id="bookingTime"
                  value={`${slot.schedule_id}:${slot.starts_at}`}
                  onChange={(e) => setSelectedKey(e.target.value)}
                >
                  {slots.map((s) => (
                    <option
                      value={`${s.schedule_id}:${s.starts_at}`}
                      key={`${s.schedule_id}:${s.starts_at}`}
                    >
                      {time(s.starts_at)}–{time(s.ends_at)} · {s.branch_name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button className="w-full" disabled={pending} type="submit">
                {pending ? 'Reservando…' : 'Confirmar turno'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {alive.length
                ? 'Este profesional no tiene horarios libres en esta fecha. Elegí otro día o profesional.'
                : 'No hay mascotas disponibles para reservar. Consultá con la veterinaria.'}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          La veterinaria todavía no configuró disponibilidad de profesionales.
        </p>
      )}
      {state && (
        <p
          role="status"
          className={state.success ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}
        >
          {state.success
            ? 'Turno confirmado. Ya está guardado en la agenda de la veterinaria.'
            : state.error}
        </p>
      )}
    </section>
  );
}
