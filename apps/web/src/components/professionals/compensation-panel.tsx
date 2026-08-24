'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  createCompensationRule,
  createCompensationScheme,
  updateCompensationRule,
  updateCompensationScheme,
} from '@/actions/professional-settlements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  COMPENSATION_FREQUENCIES,
  COMPENSATION_FREQUENCY_LABELS,
  COMPENSATION_RULE_TYPES,
  COMPENSATION_RULE_TYPE_LABELS,
  formatMoney,
  type CompensationRule,
  type CompensationScheme,
} from '@sincvete/shared';

interface CompensationPanelProps {
  professionalId: string;
  schemes: CompensationScheme[];
  rulesByScheme: Record<string, CompensationRule[]>;
  canWrite: boolean;
  currency?: string;
}

export function CompensationPanel({
  professionalId,
  schemes,
  rulesByScheme,
  canWrite,
  currency = 'ARS',
}: CompensationPanelProps) {
  const router = useRouter();
  const [schemeState, schemeAction, schemePending] = useActionState(createCompensationScheme, null);

  useEffect(() => {
    if (schemeState?.success) router.refresh();
  }, [schemeState, router]);

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo esquema de compensación</CardTitle>
            <CardDescription>
              Los esquemos históricos se conservan. Definí vigencia y reglas por período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={schemeAction} className="grid max-w-xl gap-4">
              <input type="hidden" name="professionalId" value={professionalId} />
              <div className="space-y-2">
                <Label htmlFor="scheme-name">Nombre</Label>
                <Input id="scheme-name" name="name" required placeholder="Agosto 2026" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="validFrom">Vigente desde</Label>
                  <Input id="validFrom" name="validFrom" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validTo">Vigente hasta</Label>
                  <Input id="validTo" name="validTo" type="date" />
                </div>
              </div>
              {schemeState?.error && <p className="text-sm text-destructive">{schemeState.error}</p>}
              <Button type="submit" disabled={schemePending}>
                {schemePending ? 'Creando...' : 'Crear esquema'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {schemes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin esquemas de compensación configurados.
        </div>
      ) : (
        schemes.map((scheme) => (
          <SchemeCard
            key={scheme.id}
            scheme={scheme}
            rules={rulesByScheme[scheme.id] ?? []}
            canWrite={canWrite}
            currency={currency}
          />
        ))
      )}
    </div>
  );
}

function SchemeCard({
  scheme,
  rules,
  canWrite,
  currency,
}: {
  scheme: CompensationScheme;
  rules: CompensationRule[];
  canWrite: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [ruleState, ruleAction, rulePending] = useActionState(createCompensationRule, null);
  const [schemeUpdateState, schemeUpdateAction, schemeUpdatePending] = useActionState(
    updateCompensationScheme,
    null
  );
  const [ruleUpdateState, ruleUpdateAction, ruleUpdatePending] = useActionState(
    updateCompensationRule,
    null
  );

  useEffect(() => {
    if (ruleState?.success || schemeUpdateState?.success || ruleUpdateState?.success) {
      router.refresh();
    }
  }, [ruleState, schemeUpdateState, ruleUpdateState, router]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{scheme.name}</CardTitle>
          <Badge variant={scheme.is_active ? 'success' : 'default'}>
            {scheme.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
        <CardDescription>
          {scheme.valid_from}
          {scheme.valid_to ? ` → ${scheme.valid_to}` : ' → sin fin'}
        </CardDescription>
        {canWrite && scheme.is_active ? (
          <form action={schemeUpdateAction} className="pt-1">
            <input type="hidden" name="id" value={scheme.id} />
            <input type="hidden" name="isActive" value="false" />
            <Button type="submit" variant="outline" size="sm" disabled={schemeUpdatePending}>
              {schemeUpdatePending ? 'Desactivando...' : 'Desactivar esquema'}
            </Button>
          </form>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin reglas en este esquema.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rules.map((rule) => (
              <li key={rule.id} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {COMPENSATION_RULE_TYPE_LABELS[rule.rule_type]} ·{' '}
                      {COMPENSATION_FREQUENCY_LABELS[rule.frequency]}
                      {!rule.is_active ? ' · Inactiva' : ''}
                    </p>
                    <p className="text-muted-foreground">
                      {rule.amount != null ? formatMoney(rule.amount, currency) : null}
                      {rule.percentage != null ? `${rule.percentage}%` : null}
                    </p>
                  </div>
                  {canWrite && rule.is_active ? (
                    <form action={ruleUpdateAction}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="isActive" value="false" />
                      <Button type="submit" variant="ghost" size="sm" disabled={ruleUpdatePending}>
                        Desactivar
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <form action={ruleAction} className="grid gap-3 rounded-md border bg-muted/20 p-4">
            <input type="hidden" name="compensationSchemeId" value={scheme.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select name="ruleType" defaultValue="fixed">
                  {COMPENSATION_RULE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {COMPENSATION_RULE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <Select name="frequency" defaultValue="monthly">
                  {COMPENSATION_FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {COMPENSATION_FREQUENCY_LABELS[frequency]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input name="amount" type="number" min="0" step="0.01" placeholder="150000" />
              </div>
              <div className="space-y-2">
                <Label>Porcentaje</Label>
                <Input name="percentage" type="number" min="0" max="100" step="0.01" />
              </div>
            </div>
            {ruleState?.error && <p className="text-sm text-destructive">{ruleState.error}</p>}
            <Button type="submit" size="sm" disabled={rulePending}>
              {rulePending ? 'Agregando...' : 'Agregar regla'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
