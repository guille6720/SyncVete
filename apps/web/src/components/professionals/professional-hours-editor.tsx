'use client';

import { Plus, Trash2 } from 'lucide-react';
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
  const updateRow = (index: number, patch: Partial<ProfessionalHoursDraft>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addRow = () => {
    const used = new Set(value.map((row) => row.weekday));
    const nextDay = WEEKDAY_OPTIONS.find((day) => !used.has(day.value))?.value ?? 1;
    onChange([
      ...value,
      { weekday: nextDay, startTime: '09:00', endTime: '18:00', slotDurationMinutes: 30 },
    ]);
  };

  const applyWeekdays = () => {
    onChange(DEFAULT_WEEKDAY_HOURS);
  };

  return (
    <div className="space-y-3">
      {includeHiddenInput && (
        <input type="hidden" name={hiddenInputName} value={JSON.stringify(value)} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar día
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={applyWeekdays}>
          Lun–Vie 09:00–18:00
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin horarios. Agregá días de atención para este profesional.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((row, index) => (
            <div
              key={`${row.weekday}-${index}`}
              className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"
            >
              <div className="space-y-1">
                <Label className="text-xs">Día</Label>
                <Select
                  value={String(row.weekday)}
                  disabled={disabled}
                  onChange={(e) => updateRow(index, { weekday: Number(e.target.value) })}
                >
                  {WEEKDAY_OPTIONS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input
                  type="time"
                  value={row.startTime}
                  disabled={disabled}
                  onChange={(e) => updateRow(index, { startTime: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input
                  type="time"
                  value={row.endTime}
                  disabled={disabled}
                  onChange={(e) => updateRow(index, { endTime: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Turno (min)</Label>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={row.slotDurationMinutes}
                  disabled={disabled}
                  onChange={(e) =>
                    updateRow(index, { slotDurationMinutes: Number(e.target.value) || 30 })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => removeRow(index)}
                  aria-label="Quitar horario"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
