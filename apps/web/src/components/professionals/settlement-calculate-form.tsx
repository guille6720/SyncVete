'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  calculateSettlement,
  calculateSettlementsForPeriod,
} from '@/actions/professional-settlements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  resolveSettlementPeriodRange,
  settlementPresetToPeriodKind,
  type Professional,
  type SettlementPeriodPreset,
} from '@sincvete/shared';

interface BranchOption {
  id: string;
  name: string;
}

interface SettlementCalculateFormProps {
  professionals: Professional[];
  branches: BranchOption[];
  defaultBranchId?: string;
  defaultProfessionalId?: string;
  periodPreset?: SettlementPeriodPreset | null;
  periodDays?: number | null;
}

export function SettlementCalculateForm({
  professionals,
  branches,
  defaultBranchId,
  defaultProfessionalId,
  periodPreset = 'month',
  periodDays = 14,
}: SettlementCalculateFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(calculateSettlement, null);
  const initialRange = resolveSettlementPeriodRange({
    kind: settlementPresetToPeriodKind(periodPreset),
    periodDays,
  });
  const [periodStart, setPeriodStart] = useState(initialRange.start);
  const [periodEnd, setPeriodEnd] = useState(initialRange.end);
  const [branchId, setBranchId] = useState(defaultBranchId ?? '');
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>(() =>
    professionals.map((row) => row.id)
  );
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkSucceeded, setBulkSucceeded] = useState<
    Array<{ professionalId: string; settlementId: string }>
  >([]);
  const [bulkFailed, setBulkFailed] = useState<Array<{ professionalId: string; error: string }>>(
    []
  );
  const [bulkPending, runBulk] = usePendingAction();

  useEffect(() => {
    setSelectedBulkIds(professionals.map((row) => row.id));
  }, [professionals]);

  useEffect(() => {
    if (state?.success && state.data?.settlement_id) {
      router.push(`/liquidaciones/${state.data.settlement_id}`);
    }
  }, [state, router]);

  const applyPreset = (kind: 'month' | 'last_month' | 'biweekly' | 'custom') => {
    const range = resolveSettlementPeriodRange({ kind, periodDays });
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
  };

  const toggleBulkId = (id: string, checked: boolean) => {
    setSelectedBulkIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)
    );
  };

  const handleBulkCalculate = () => {
    setBulkMessage(null);
    setBulkSucceeded([]);
    setBulkFailed([]);
    void runBulk(async () => {
      const result = await calculateSettlementsForPeriod({
        periodStart,
        periodEnd,
        branchId: branchId || null,
        professionalIds: selectedBulkIds,
      });
      if (!result?.success || !result.data) {
        throw new Error(result?.error ?? 'No se pudo calcular el lote');
      }
      return result.data;
    }).then((data) => {
      if (!data) return;
      setBulkSucceeded(data.succeeded);
      setBulkFailed(data.failed);
      setBulkMessage(
        data.failed.length > 0
          ? `${data.succeeded.length} OK · ${data.failed.length} con error`
          : `${data.succeeded.length} liquidacion${data.succeeded.length !== 1 ? 'es' : ''} generada${data.succeeded.length !== 1 ? 's' : ''}`
      );
      if (data.succeeded.length > 0) router.refresh();
    });
  };

  const professionalName = (id: string) => {
    const row = professionals.find((item) => item.id === id);
    return row ? `${row.last_name}, ${row.first_name}` : id.slice(0, 8);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calcular liquidación</CardTitle>
        <CardDescription>
          Genera o recalcula un borrador para el período indicado. Requiere esquema activo y permisos
          de compensación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={formAction} className="grid max-w-xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="professionalId">Profesional</Label>
            <Select
              id="professionalId"
              name="professionalId"
              required
              defaultValue={defaultProfessionalId ?? ''}
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.last_name}, {professional.first_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('month')}>
              Este mes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset('last_month')}
            >
              Mes anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset('biweekly')}
            >
              Quincena actual
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('custom')}>
              Últimos {periodDays ?? 14} días
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="periodStart">Desde</Label>
              <Input
                id="periodStart"
                name="periodStart"
                type="date"
                required
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">Hasta</Label>
              <Input
                id="periodEnd"
                name="periodEnd"
                type="date"
                required
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {branches.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal (opcional)</Label>
              <Select
                id="branchId"
                name="branchId"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Todas</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <Button type="submit" disabled={pending || professionals.length === 0}>
            {pending ? 'Calculando...' : 'Calcular liquidación'}
          </Button>
        </form>

        <div className="max-w-xl space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium">Cálculo masivo</p>
            <p className="text-xs text-muted-foreground">
              Mismo período y sucursal. Seleccioná profesionales o usá todos los activos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedBulkIds(professionals.map((row) => row.id))}
            >
              Todos
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedBulkIds([])}>
              Ninguno
            </Button>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-3">
            {professionals.map((professional) => (
              <label key={professional.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedBulkIds.includes(professional.id)}
                  onChange={(e) => toggleBulkId(professional.id, e.target.checked)}
                />
                <span>
                  {professional.last_name}, {professional.first_name}
                </span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={
              bulkPending || pending || professionals.length === 0 || selectedBulkIds.length === 0
            }
            onClick={handleBulkCalculate}
          >
            {bulkPending
              ? 'Calculando lote...'
              : `Calcular ${selectedBulkIds.length} seleccionado${selectedBulkIds.length !== 1 ? 's' : ''}`}
          </Button>
          {bulkMessage ? <p className="text-xs text-muted-foreground">{bulkMessage}</p> : null}
          {bulkSucceeded.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {bulkSucceeded.map((row) => (
                <li key={row.settlementId}>
                  <Link
                    href={`/liquidaciones/${row.settlementId}`}
                    className="text-primary hover:underline"
                  >
                    {professionalName(row.professionalId)} → ver liquidación
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {bulkFailed.length > 0 ? (
            <ul className="space-y-1 text-xs text-destructive">
              {bulkFailed.map((row) => (
                <li key={row.professionalId}>
                  {professionalName(row.professionalId)}: {row.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
