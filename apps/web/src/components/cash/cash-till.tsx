'use client';

import { useActionState, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  addCashMovementAction,
  closeCashSessionAction,
} from '@/actions/cash';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CASH_MOVEMENT_KIND_LABELS,
  CASH_MOVEMENT_KIND_VARIANT,
  MANUAL_CASH_MOVEMENT_KINDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  computeExpectedCash,
  extractSettlementHrefFromCashNote,
  formatClinicalEntryDateTime,
  formatMoney,
  sumMovementsByMethod,
  type CashMovementListRow,
  type CashSessionListRow,
} from '@sincvete/shared';

interface CashTillProps {
  session: CashSessionListRow;
  movements: CashMovementListRow[];
  canWrite: boolean;
  currency?: string;
}

export function CashTill({
  session,
  movements,
  canWrite,
  currency = 'ARS',
}: CashTillProps) {
  const expected = computeExpectedCash(session.opening_amount, movements);
  const byMethod = sumMovementsByMethod(movements);
  const addAction = addCashMovementAction.bind(null, session.id);
  const closeAction = closeCashSessionAction.bind(null, session.id);
  const [addState, addFormAction, addPending] = useActionState(addAction, null);
  const [closeState, closeFormAction, closePending] = useActionState(closeAction, null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const closeFormRef = useRef<HTMLFormElement>(null);
  const skipCloseConfirmRef = useRef(false);
  const pending = addPending || closePending;

  const onCloseSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (skipCloseConfirmRef.current) {
      skipCloseConfirmRef.current = false;
      return;
    }
    event.preventDefault();
    setCloseConfirmOpen(true);
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={closeConfirmOpen}
        title="Cerrar caja"
        description={`¿Cerrar la caja de ${session.branch_name}? Efectivo esperado: ${formatMoney(expected, currency)}.`}
        confirmLabel="Cerrar caja"
        variant="destructive"
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={() => {
          skipCloseConfirmRef.current = true;
          closeFormRef.current?.requestSubmit();
        }}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Caja abierta · {session.branch_name}</CardTitle>
            <Badge variant="warning">Abierta</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(session.opened_at)}
            {session.opened_by_name ? ` · ${session.opened_by_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Stat label="Fondo inicial" value={formatMoney(session.opening_amount, currency)} />
          <Stat label="Efectivo esperado" value={formatMoney(expected, currency)} />
          <Stat
            label="Movimientos"
            value={String(movements.length)}
          />
        </CardContent>
      </Card>

      {byMethod.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cobros e ingresos por medio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {byMethod.map((row) => (
              <div key={row.method} className="rounded-lg border px-3 py-2 text-sm">
                <p className="text-muted-foreground">{PAYMENT_METHOD_LABELS[row.method]}</p>
                <p className="font-medium">
                  {formatMoney(row.amount, currency)} · {row.count}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canWrite && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Movimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addFormAction} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="kind">Tipo *</Label>
                    <Select id="kind" name="kind" defaultValue="egreso" required>
                      {MANUAL_CASH_MOVEMENT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {CASH_MOVEMENT_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Importe *</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="method">Medio (ingresos)</Label>
                  <Select id="method" name="method" defaultValue="efectivo">
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Input id="notes" name="notes" placeholder="Motivo del movimiento" />
                </div>
                {addState?.error && <p className="text-sm text-destructive">{addState.error}</p>}
                <Button type="submit" disabled={pending}>
                  {addPending ? 'Registrando...' : 'Registrar'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cerrar caja</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                ref={closeFormRef}
                action={closeFormAction}
                onSubmit={onCloseSubmit}
                className="grid gap-4"
              >
                <p className="text-sm text-muted-foreground">
                  Contá el efectivo del cajón. Esperado: {formatMoney(expected, currency)}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="countedCash">Efectivo contado *</Label>
                  <Input
                    id="countedCash"
                    name="countedCash"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={String(expected)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closeNotes">Notas de cierre</Label>
                  <Textarea id="closeNotes" name="notes" rows={2} />
                </div>
                {closeState?.error && (
                  <p className="text-sm text-destructive">{closeState.error}</p>
                )}
                <Button type="submit" variant="destructive" disabled={pending}>
                  {closePending ? 'Cerrando...' : 'Cerrar caja'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <CashMovementsList movements={movements} currency={currency} />
    </div>
  );
}

export function CashMovementsList({
  movements,
  currency = 'ARS',
}: {
  movements: CashMovementListRow[];
  currency?: string;
}) {
  if (movements.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Todavía no hay movimientos en esta caja.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Movimientos</h2>
      {movements.map((movement) => {
        const settlementHref =
          movement.professional_settlement_id
            ? `/liquidaciones/${movement.professional_settlement_id}`
            : extractSettlementHrefFromCashNote(movement.notes);
        const notesWithoutHref =
          settlementHref && movement.notes
            ? movement.notes
                .replace(settlementHref, '')
                .replace(/\s*·\s*·\s*/g, ' · ')
                .replace(/\s*·\s*$/, '')
                .replace(/^\s*·\s*/, '')
                .trim()
            : movement.notes;
        return (
        <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={CASH_MOVEMENT_KIND_VARIANT[movement.kind]}>
                {CASH_MOVEMENT_KIND_LABELS[movement.kind]}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {PAYMENT_METHOD_LABELS[movement.method]}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatClinicalEntryDateTime(movement.created_at)}
              {movement.recorded_by_name ? ` · ${movement.recorded_by_name}` : ''}
              {movement.invoice_number ? ` · ${movement.invoice_number}` : ''}
              {notesWithoutHref ? ` · ${notesWithoutHref}` : ''}
            </p>
            {settlementHref ? (
              <Link
                href={settlementHref}
                className="mt-1 inline-block text-sm text-primary hover:underline"
              >
                Ver liquidación
              </Link>
            ) : null}
          </div>
          <div className="text-right">
            <p className="font-medium">{formatMoney(movement.amount, currency)}</p>
            {movement.invoice_id && (
              <Link
                href={`/facturacion/${movement.invoice_id}`}
                className="text-sm text-primary hover:underline"
              >
                Ver factura
              </Link>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
    </div>
  );
}
