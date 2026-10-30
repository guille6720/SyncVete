'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export type ProfessionalHoursDraft = {
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
};

export const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

export const DEFAULT_WEEKDAY_HOURS: ProfessionalHoursDraft[] = [
  { weekday: 1, startTime: '09:00', endTime: '18:00', slotDurationMinutes: 30 },
  { weekday: 2, startTime: '09:00', endTime: '18:00', slotDurationMinutes: 30 },
  { weekday: 3, startTime: '09:00', endTime: '18:00', slotDurationMinutes: 30 },
  { weekday: 4, startTime: '09:00', endTime: '18:00', slotDurationMinutes: 30 },
  { weekday: 5, startTime: '09:00', endTime: '18:00', slotDurationMinutes: 30 },
];

interface ProfessionalHoursEditorProps {
  value: ProfessionalHoursDraft[];
  onChange: (next: ProfessionalHoursDraft[]) => void;
  disabled?: boolean;
  /** When true, writes a hidden input for server actions. */
  includeHiddenInput?: boolean;
  hiddenInputName?: string;
}

export function ProfessionalHoursEditor({
  value,
  onChange,
  disabled = false,
  includeHiddenInput = true,
  hiddenInputName = 'schedulesJson',
}: ProfessionalHoursEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({
    startTime: '09:00',
    endTime: '18:00',
    slotDurationMinutes: 15,
  });
  const first = value[0] ?? draft;
  const uniform = value.every(
    (r) =>
      r.startTime === first.startTime &&
      r.endTime === first.endTime &&
      r.slotDurationMinutes === first.slotDurationMinutes
  );
  const selected = new Set(value.map((r) => r.weekday));
  const setCommon = (patch: Partial<ProfessionalHoursDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    onChange(value.map((r) => ({ ...r, ...patch })));
  };
  const updateRow = (index: number, patch: Partial<ProfessionalHoursDraft>) =>
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-4">
      {includeHiddenInput ? (
        <input type="hidden" name={hiddenInputName} value={JSON.stringify(value)} />
      ) : null}
      <div className="flex flex-wrap gap-2" aria-label="Días de atención">
        {WEEKDAY_OPTIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            aria-pressed={selected.has(d.value)}
            disabled={disabled}
            onClick={() =>
              onChange(
                selected.has(d.value)
                  ? value.filter((r) => r.weekday !== d.value)
                  : [
                      ...value,
                      {
                        weekday: d.value,
                        startTime: first.startTime,
                        endTime: first.endTime,
                        slotDurationMinutes: first.slotDurationMinutes,
                      },
                    ].sort((a, b) => a.weekday - b.weekday)
              )
            }
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${selected.has(d.value) ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
          >
            {d.label.slice(0, 3)}
          </button>
        ))}
      </div>
      {uniform ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="hours-start">Desde</Label>
              <Input
                id="hours-start"
                type="time"
                value={first.startTime}
                disabled={disabled}
                onChange={(e) => setCommon({ startTime: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hours-end">Hasta</Label>
              <Input
                id="hours-end"
                type="time"
                value={first.endTime}
                disabled={disabled}
                onChange={(e) => setCommon({ endTime: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hours-duration">Duración de cada turno</Label>
            <Select
              id="hours-duration"
              value={String(first.slotDurationMinutes)}
              disabled={disabled}
              onChange={(e) => setCommon({ slotDurationMinutes: Number(e.target.value) })}
            >
              {[...new Set([10, 15, 20, 30, 45, 60, first.slotDurationMinutes])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {m} minutos
                  </option>
                ))}
            </Select>
          </div>
        </>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setExpanded(true);
          if (!value.length) onChange([{ weekday: 1, ...draft }]);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        Horarios por día / agregar otra franja
      </Button>
      {expanded || !uniform ? (
        <div className="space-y-3 rounded-lg border p-3">
          {value.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`day-${i}`}>Día</Label>
                <Select
                  id={`day-${i}`}
                  value={String(r.weekday)}
                  disabled={disabled}
                  onChange={(e) => updateRow(i, { weekday: Number(e.target.value) })}
                >
                  {WEEKDAY_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Quitar horario ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <Label htmlFor={`start-${i}`}>Desde</Label>
                <Input
                  id={`start-${i}`}
                  type="time"
                  value={r.startTime}
                  disabled={disabled}
                  onChange={(e) => updateRow(i, { startTime: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`end-${i}`}>Hasta</Label>
                <Input
                  id={`end-${i}`}
                  type="time"
                  value={r.endTime}
                  disabled={disabled}
                  onChange={(e) => updateRow(i, { endTime: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`duration-${i}`}>Duración (minutos)</Label>
                <Input
                  id={`duration-${i}`}
                  type="number"
                  min={5}
                  max={480}
                  value={r.slotDurationMinutes}
                  disabled={disabled}
                  onChange={(e) => updateRow(i, { slotDurationMinutes: Number(e.target.value) })}
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange([
                ...value,
                {
                  weekday: value[0]?.weekday ?? 1,
                  startTime: '18:00',
                  endTime: '20:00',
                  slotDurationMinutes: 15,
                },
              ])
            }
          >
            Agregar otra franja
          </Button>
        </div>
      ) : null}
      {value.length ? (
        <ul className="space-y-1 rounded-lg bg-primary/10 p-3 text-sm">
          {[...value]
            .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
            .map((r, i) => (
              <li key={i}>
                <strong>{WEEKDAY_OPTIONS.find((d) => d.value === r.weekday)?.label}</strong> ·{' '}
                {r.startTime} a {r.endTime} · {r.slotDurationMinutes} min
              </li>
            ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Seleccioná los días de atención. Podés guardar la ficha sin horarios y completarlos
          después.
        </p>
      )}
    </div>
  );
}
