'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  cloneCompensationScheme,
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
  SchemeConditionsFields,
  SchemeConditionsSummary,
} from '@/components/professionals/scheme-conditions-fields';
import {
  COMPENSATION_FREQUENCIES_UI,
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
              Los esquemas históricos se conservan. Definí vigencia y reglas por período. No se
              permiten solapamientos entre esquemas activos.
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
              <SchemeConditionsFields idPrefix="new-scheme" />
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
  const [cloneState, cloneAction, clonePending] = useActionState(cloneCompensationScheme, null);

  useEffect(() => {
    if (
      ruleState?.success ||
      schemeUpdateState?.success ||
      ruleUpdateState?.success ||
      cloneState?.success
    ) {
      router.refresh();
    }
  }, [ruleState, schemeUpdateState, ruleUpdateState, cloneState, router]);

  const conditions = scheme.conditions ?? {};
  const defaultAnchor = conditions.anchor_date ? String(conditions.anchor_date) : '';
  const defaultPeriodDays = conditions.period_days != null ? String(conditions.period_days) : '';
  const cloneFromDefault = new Date().toISOString().slice(0, 10);

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
        <SchemeConditionsSummary conditions={scheme.conditions} />
        {canWrite && scheme.is_active ? (
          <form action={schemeUpdateAction} className="pt-1">
            <input type="hidden" name="id" value={scheme.id} />
            <input type="hidden" name="isActive" value="false" />
            <Button type="submit" variant="outline" size="sm" disabled={schemeUpdatePending}>
              {schemeUpdatePending ? 'Desactivando...' : 'Desactivar esquema'}
            </Button>
          </form>
        ) : null}
        {canWrite && !scheme.is_active ? (
          <form action={schemeUpdateAction} className="pt-1">
            <input type="hidden" name="id" value={scheme.id} />
            <input type="hidden" name="isActive" value="true" />
            <Button type="submit" variant="outline" size="sm" disabled={schemeUpdatePending}>
              {schemeUpdatePending ? 'Reactivando...' : 'Reactivar esquema'}
            </Button>
            {schemeUpdateState?.error ? (
              <p className="mt-1 text-sm text-destructive">{schemeUpdateState.error}</p>
            ) : null}
          </form>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {canWrite ? (
          <form
            action={schemeUpdateAction}
            className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={scheme.id} />
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Nombre</Label>
              <Input name="name" defaultValue={scheme.name} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vigente desde</Label>
              <Input name="validFrom" type="date" defaultValue={scheme.valid_from} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vigente hasta</Label>
              <Input name="validTo" type="date" defaultValue={scheme.valid_to ?? ''} />
            </div>
            <div className="sm:col-span-2">
              <SchemeConditionsFields
                idPrefix={`edit-${scheme.id}`}
                defaultAnchorDate={defaultAnchor}
                defaultPeriodDays={defaultPeriodDays}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={schemeUpdatePending}>
                {schemeUpdatePending ? 'Guardando...' : 'Guardar esquema'}
              </Button>
            </div>
            {schemeUpdateState?.error ? (
              <p className="sm:col-span-2 text-sm text-destructive">{schemeUpdateState.error}</p>
            ) : null}
          </form>
        ) : null}

        {canWrite ? (
          <form action={cloneAction} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <input type="hidden" name="sourceSchemeId" value={scheme.id} />
            <div className="space-y-1 sm:col-span-2">
              <p className="text-sm font-medium">Clonar esquema</p>
              <p className="text-xs text-muted-foreground">
                Copia reglas activas a un nuevo período. Si hay solapamiento con otro esquema activo,
                la clonación se rechaza.
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Nombre nuevo</Label>
              <Input name="name" required placeholder={`${scheme.name} (nuevo)`} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vigente desde</Label>
              <Input name="validFrom" type="date" required defaultValue={cloneFromDefault} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vigente hasta</Label>
              <Input name="validTo" type="date" />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="deactivateSource"
                value="true"
                defaultChecked
                className="h-4 w-4 rounded border"
              />
              Desactivar origen y cerrar vigencia el día anterior
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" variant="secondary" disabled={clonePending}>
                {clonePending ? 'Clonando...' : 'Clonar esquema'}
              </Button>
            </div>
            {cloneState?.error ? (
              <p className="sm:col-span-2 text-sm text-destructive">{cloneState.error}</p>
            ) : null}
          </form>
        ) : null}

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
                      {rule.minimum_amount != null || rule.maximum_amount != null ? (
                        <span>
                          {' '}
                          · piso{' '}
                          {rule.minimum_amount != null
                            ? formatMoney(rule.minimum_amount, currency)
                            : '—'}
                          {' / '}
                          techo{' '}
                          {rule.maximum_amount != null
                            ? formatMoney(rule.maximum_amount, currency)
                            : '—'}
                        </span>
                      ) : null}
                    </p>
                    {rule.activity_type ? (
                      <p className="text-xs text-muted-foreground">
                        Actividad: {rule.activity_type}
                      </p>
                    ) : null}
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
                  {canWrite && !rule.is_active ? (
                    <form action={ruleUpdateAction}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="isActive" value="true" />
                      <Button type="submit" variant="ghost" size="sm" disabled={ruleUpdatePending}>
                        Reactivar
                      </Button>
                    </form>
                  ) : null}
                </div>
                {canWrite ? (
                  <form
                    action={ruleUpdateAction}
                    className="mt-3 grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-2"
                  >
                    <input type="hidden" name="id" value={rule.id} />
                    <div className="space-y-1">
                      <Label className="text-xs">Monto</Label>
                      <Input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rule.amount ?? ''}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Porcentaje</Label>
                      <Input
                        name="percentage"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={rule.percentage ?? ''}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mínimo</Label>
                      <Input
                        name="minimumAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rule.minimum_amount ?? ''}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Máximo</Label>
                      <Input
                        name="maximumAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={rule.maximum_amount ?? ''}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Tipo de actividad (filtro)</Label>
                      <Input
                        name="activityType"
                        maxLength={80}
                        defaultValue={rule.activity_type ?? ''}
                        placeholder="ej. radiografia, consulta, emergencia"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit" size="sm" disabled={ruleUpdatePending}>
                        {ruleUpdatePending ? 'Guardando...' : 'Guardar regla'}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
            {ruleUpdateState?.error ? (
              <p className="text-sm text-destructive">{ruleUpdateState.error}</p>
            ) : null}
          </ul>
        )}

        {canWrite && scheme.is_active ? (
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
                  {COMPENSATION_FREQUENCIES_UI.map((frequency) => (
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mínimo (opcional)</Label>
                <Input
                  name="minimumAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Piso en % de consultas"
                />
              </div>
              <div className="space-y-2">
                <Label>Máximo (opcional)</Label>
                <Input
                  name="maximumAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Techo en % de consultas"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de actividad (opcional)</Label>
              <Input
                name="activityType"
                maxLength={80}
                placeholder="Filtra orígenes: radiografia, consulta, emergencia…"
              />
              <p className="text-xs text-muted-foreground">
                En procedimientos filtra el kind de imagen; en turnos el appointment_type; en
                guardias el note_type.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo/máximo aplican a reglas de porcentaje sobre facturación de consultas.
            </p>
            {ruleState?.error && <p className="text-sm text-destructive">{ruleState.error}</p>}
            <Button type="submit" size="sm" disabled={rulePending}>
              {rulePending ? 'Agregando...' : 'Agregar regla'}
            </Button>
          </form>
        ) : null}
        {canWrite && !scheme.is_active ? (
          <p className="text-xs text-muted-foreground">
            Reactivá el esquema para agregar reglas nuevas. Podés editar las existentes y ajustar
            vigencia antes de reactivar (sin solapar otro activo).
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
