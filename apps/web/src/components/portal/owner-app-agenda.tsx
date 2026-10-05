'use client';

import { useActionState } from 'react';
import { CalendarPlus, Bell } from 'lucide-react';
import {
  bookOwnerAppSlot,
  cancelOwnerAppBooking,
  type OwnerAppReminder,
  type OwnerAppSlot,
  type OwnerAppBooking,
} from '@/actions/owner-app';
import type { PortalPatientSummary } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export function OwnerAppAgenda({
  slots,
  reminders,
  patients,
  bookings,
}: {
  slots: OwnerAppSlot[];
  reminders: OwnerAppReminder[];
  patients: PortalPatientSummary[];
  bookings: OwnerAppBooking[];
}) {
  const [state, action, pending] = useActionState(bookOwnerAppSlot, null);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelOwnerAppBooking, null);
  const alive = patients.filter((patient) => !patient.isDeceased);
  return (
    <div className="space-y-6 border-b pb-6">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarPlus size={18} /> Reservar turno
        </h2>
        {slots.length > 0 && alive.length > 0 ? (
          <form action={action} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="patientId">Mascota</Label>
              <Select name="patientId" id="patientId" required>
                {alive.map((patient) => (
                  <option value={patient.id} key={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="slotId">Horario</Label>
              <Select name="slotId" id="slotId" required>
                {slots.map((slot) => (
                  <option value={slot.id} key={slot.id}>
                    {new Date(slot.starts_at).toLocaleString('es-AR')} - {slot.branch_name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={pending}>
              <CalendarPlus size={16} />
              {pending ? 'Reservando...' : 'Confirmar turno'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay horarios disponibles. Contacta a la veterinaria.
          </p>
        )}
        {state && (
          <p
            role="status"
            className={state.success ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}
          >
            {state.success ? 'Turno reservado. Ya aparece en tus proximos turnos.' : state.error}
          </p>
        )}
        {bookings.length > 0 && (
          <form action={cancelAction} className="space-y-2">
            <Label htmlFor="appointmentId">Mis reservas</Label>
            <Select name="appointmentId" id="appointmentId" required>
              {bookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.patient_name} - {new Date(booking.starts_at).toLocaleString('es-AR')}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="outline" disabled={cancelling}>
              Cancelar reserva
            </Button>
            {cancelState && (
              <p role="status" className="text-sm">
                {cancelState.success ? 'Reserva cancelada' : cancelState.error}
              </p>
            )}
          </form>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell size={18} /> Recordatorios
        </h2>
        {reminders.length ? (
          <ul className="divide-y">
            {reminders.map((reminder) => (
              <li className="py-2 text-sm" key={reminder.id}>
                {reminder.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No tenes recordatorios pendientes.</p>
        )}
      </section>
    </div>
  );
}
