'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { calculateSettlement } from '@/actions/professional-settlements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { Professional } from '@sincvete/shared';

interface BranchOption {
  id: string;
  name: string;
}

interface SettlementCalculateFormProps {
  professionals: Professional[];
  branches: BranchOption[];
  defaultBranchId?: string;
}

export function SettlementCalculateForm({
  professionals,
  branches,
  defaultBranchId,
}: SettlementCalculateFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(calculateSettlement, null);

  useEffect(() => {
    if (state?.success && state.data?.settlement_id) {
      router.push(`/liquidaciones/${state.data.settlement_id}`);
    }
  }, [state, router]);

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calcular liquidación</CardTitle>
        <CardDescription>
          Genera o recalcula un borrador para el período indicado. Requiere esquema activo y permisos
          de compensación.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="professionalId">Profesional</Label>
            <Select id="professionalId" name="professionalId" required defaultValue="">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="periodStart">Desde</Label>
              <Input id="periodStart" name="periodStart" type="date" required defaultValue={monthStart} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">Hasta</Label>
              <Input id="periodEnd" name="periodEnd" type="date" required defaultValue={monthEnd} />
            </div>
          </div>

          {branches.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal (opcional)</Label>
              <Select id="branchId" name="branchId" defaultValue={defaultBranchId ?? ''}>
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
      </CardContent>
    </Card>
  );
}
