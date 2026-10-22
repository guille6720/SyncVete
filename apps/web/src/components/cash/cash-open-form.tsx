'use client';

import { useActionState } from 'react';
import { openCashSessionAction } from '@/actions/cash';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface CashOpenFormProps {
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
}

export function CashOpenForm({ branches, defaultBranchId }: CashOpenFormProps) {
  const [state, formAction, pending] = useActionState(openCashSessionAction, null);
  const sessionBranch = branches.find((branch) => branch.id === defaultBranchId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abrir caja</CardTitle>
        {sessionBranch ? (
          <p className="text-sm text-muted-foreground">
            Se abre en la sucursal de tu sesión: {sessionBranch.name}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-xl gap-4">
          {sessionBranch ? (
            <input type="hidden" name="branchId" value={sessionBranch.id} />
          ) : branches.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal *</Label>
              <Select id="branchId" name="branchId" required defaultValue="">
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="openingAmount">Fondo inicial *</Label>
            <Input
              id="openingAmount"
              name="openingAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              required
            />
            {state?.fieldErrors?.openingAmount?.[0] && (
              <p className="text-sm text-destructive">{state.fieldErrors.openingAmount[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? 'Abriendo...' : 'Abrir caja'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
