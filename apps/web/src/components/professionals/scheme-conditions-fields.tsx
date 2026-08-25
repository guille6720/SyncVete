import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SchemeConditionsFieldsProps {
  idPrefix?: string;
  defaultAnchorDate?: string;
  defaultPeriodDays?: number | string;
}

export function SchemeConditionsFields({
  idPrefix = 'scheme',
  defaultAnchorDate = '',
  defaultPeriodDays = '',
}: SchemeConditionsFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-anchorDate`}>Ancla de período (opcional)</Label>
        <Input
          id={`${idPrefix}-anchorDate`}
          name="anchorDate"
          type="date"
          defaultValue={defaultAnchorDate}
        />
        <p className="text-xs text-muted-foreground">
          Para quincenas o ciclos personalizados (ej. inicio del esquema).
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-periodDays`}>Días por período (opcional)</Label>
        <Input
          id={`${idPrefix}-periodDays`}
          name="periodDays"
          type="number"
          min="1"
          max="366"
          step="1"
          defaultValue={defaultPeriodDays}
          placeholder="14"
        />
        <p className="text-xs text-muted-foreground">Ej. 14 para quincenal, 7 para semanal.</p>
      </div>
    </div>
  );
}

function formatConditionValue(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function SchemeConditionsSummary({
  conditions,
}: {
  conditions: Record<string, unknown> | null;
}) {
  if (!conditions) return null;
  const anchorDate = formatConditionValue(conditions.anchor_date);
  const periodDays = formatConditionValue(conditions.period_days);
  if (!anchorDate && !periodDays) return null;

  return (
    <p className="text-xs text-muted-foreground">
      Período custom
      {anchorDate ? ` · ancla ${anchorDate}` : ''}
      {periodDays ? ` · ${periodDays} días` : ''}
    </p>
  );
}
