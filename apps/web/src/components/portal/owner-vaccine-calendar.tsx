'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PortalVaccineDueRow } from '@sincvete/shared';
import { Button } from '@/components/ui/button';

export function OwnerVaccineCalendar({ vaccines }: { vaccines: PortalVaccineDueRow[] }) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const key = (day: number) =>
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const changeMonth = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const selectedVaccines = vaccines.filter((vaccine) =>
    vaccine.nextDueAt?.startsWith(key(1).slice(0, 7))
  );
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Calendario de vacunacion</h2>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => changeMonth(-1)}
            title="Mes anterior"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => changeMonth(1)}
            title="Mes siguiente"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <p className="font-medium" aria-live="polite">
        {month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
      </p>
      <div className="grid grid-cols-7 text-center text-xs">
        {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((day) => (
          <div className="py-2 font-semibold text-muted-foreground" key={day}>
            {day}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const rows = vaccines.filter((vaccine) => vaccine.nextDueAt === key(i + 1));
          return (
            <div
              key={i}
              className="relative flex aspect-square max-h-16 items-center justify-center border"
              aria-label={`${key(i + 1)}${rows.length ? `: ${rows.map((row) => row.vaccineName).join(', ')}` : ''}`}
            >
              <span className={rows.length ? 'font-bold text-emerald-700' : ''}>{i + 1}</span>
              {rows.length > 0 && (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-600" />
              )}
            </div>
          );
        })}
      </div>
      {selectedVaccines.length > 0 ? (
        <ul className="divide-y text-sm">
          {selectedVaccines.map((vaccine) => (
            <li className="py-2" key={vaccine.id}>
              <strong>{vaccine.nextDueAt?.split('-').reverse().join('/')}</strong> -{' '}
              {vaccine.vaccineName}
              {vaccine.patientName ? ` - ${vaccine.patientName}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin vacunas previstas para este mes.</p>
      )}
    </section>
  );
}
