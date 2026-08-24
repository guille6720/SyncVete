'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  addSettlementAdjustment,
  approveSettlement,
  cancelSettlement,
  registerProfessionalPayment,
  submitSettlementForReview,
} from '@/actions/professional-settlements';
import { SettlementDetailActions } from '@/components/professionals/settlement-detail-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SETTLEMENT_ADJUSTMENT_TYPES,
  SETTLEMENT_ADJUSTMENT_TYPE_LABELS,
  SETTLEMENT_ITEM_SOURCE_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_VARIANT,
  formatMoney,
  getSettlementItemSourceHref,
  isSettlementLocked,
  type Professional,
  type ProfessionalSettlementDetail,
} from '@sincvete/shared';

interface SettlementDetailProps {
  settlement: ProfessionalSettlementDetail;
  professional: Professional | null;
  organizationName: string;
  canApprove: boolean;
  canPay: boolean;
  canAdjust: boolean;
  readOnly?: boolean;
  showAuditLink?: boolean;
}

export function SettlementDetail({
  settlement,
  professional,
  organizationName,
  canApprove,
  canPay,
  canAdjust,
  readOnly = false,
  showAuditLink = false,
}: SettlementDetailProps) {
  const router = useRouter();
  const currency = settlement.currency ?? 'ARS';
  const locked = isSettlementLocked(settlement.status);
  const canRegisterPayment =
    canPay && (settlement.status === 'approved' || settlement.status === 'partially_paid');
  const canApproveNow = canApprove && (settlement.status === 'draft' || settlement.status === 'review');
  const canCancelNow =
    canApprove && settlement.status !== 'paid' && settlement.status !== 'cancelled';

  const canSubmitForReview = canAdjust && settlement.status === 'draft';
  const canRecalculate =
    canAdjust && (settlement.status === 'draft' || settlement.status === 'review');

  const [approveState, approveAction, approvePending] = useActionState(approveSettlement, null);
  const [submitState, submitAction, submitPending] = useActionState(submitSettlementForReview, null);
  const [adjustState, adjustAction, adjustPending] = useActionState(addSettlementAdjustment, null);
  const [payState, payAction, payPending] = useActionState(registerProfessionalPayment, null);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelSettlement, null);

  useEffect(() => {
    if (
      approveState?.success ||
      submitState?.success ||
      adjustState?.success ||
      payState?.success ||
      cancelState?.success
    ) {
      router.refresh();
    }
  }, [approveState, submitState, adjustState, payState, cancelState, router]);

  return (
    <div className="space-y-4">
      {!readOnly ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href="/liquidaciones">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a liquidaciones
          </Link>
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Liquidación</CardTitle>
            <Badge variant={SETTLEMENT_STATUS_VARIANT[settlement.status]}>
              {SETTLEMENT_STATUS_LABELS[settlement.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {professional
              ? `${professional.last_name}, ${professional.first_name}`
              : 'Profesional'}{' '}
            · {settlement.period_start} → {settlement.period_end}
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Bruto" value={formatMoney(settlement.gross_amount, currency)} />
          <Stat label="Bonificaciones" value={formatMoney(settlement.adjustments_amount, currency)} />
          <Stat label="Deducciones" value={formatMoney(settlement.deductions_amount, currency)} />
          <Stat label="Total" value={formatMoney(settlement.total_amount, currency)} />
          <Stat label="Pagado" value={formatMoney(settlement.total_paid, currency)} />
          <Stat label="Saldo" value={formatMoney(settlement.balance_due, currency)} />
        </CardContent>
      </Card>

      {!readOnly ? (
        <SettlementDetailActions
          settlement={settlement}
          professional={professional}
          organizationName={organizationName}
          canSubmitForReview={canSubmitForReview}
          canRecalculate={canRecalculate}
          submitAction={submitAction}
          submitPending={submitPending}
          auditHref={
            showAuditLink
              ? `/auditoria?entityType=professional_settlements&search=${settlement.id}`
              : null
          }
        />
      ) : (
        <SettlementDetailActions
          settlement={settlement}
          professional={professional}
          organizationName={organizationName}
          canSubmitForReview={false}
          canRecalculate={false}
          submitAction={submitAction}
          submitPending={false}
          exportOnly
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle calculado</CardTitle>
        </CardHeader>
        <CardContent>
          {settlement.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ítems calculados.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {settlement.items.map((item) => {
                const sourceHref =
                  item.source_href ?? getSettlementItemSourceHref(item.source_type, item.source_id);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.description}</p>
                      <p className="text-muted-foreground">
                        {SETTLEMENT_ITEM_SOURCE_TYPE_LABELS[item.source_type]}
                        {item.quantity > 1 ? ` · x${item.quantity}` : ''}
                      </p>
                      {sourceHref ? (
                        <Link href={sourceHref} className="text-xs text-primary hover:underline">
                          Ver origen
                        </Link>
                      ) : null}
                    </div>
                    <span>{formatMoney(item.calculated_amount, currency)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {settlement.adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes manuales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {settlement.adjustments.map((adjustment) => (
              <div key={adjustment.id} className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">
                  {SETTLEMENT_ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type]}
                </p>
                <p>{adjustment.reason}</p>
                <p>{formatMoney(adjustment.amount, currency)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {settlement.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagos registrados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {settlement.payments.map((payment) => (
              <div key={payment.id} className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">{formatMoney(payment.amount, payment.currency)}</p>
                <p className="text-muted-foreground">
                  {PAYMENT_METHOD_LABELS[payment.method]} · {payment.paid_at.slice(0, 10)}
                  {payment.invoice_number ? ` · FC ${payment.invoice_number}` : ''}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!readOnly && canAdjust && !locked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agregar ajuste</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={adjustAction} className="grid max-w-md gap-3">
              <input type="hidden" name="settlementId" value={settlement.id} />
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select name="adjustmentType" defaultValue="bonus">
                  {SETTLEMENT_ADJUSTMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SETTLEMENT_ADJUSTMENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input name="amount" type="number" min="0.01" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Textarea name="reason" rows={2} required minLength={3} />
              </div>
              {adjustState?.error && <p className="text-sm text-destructive">{adjustState.error}</p>}
              <Button type="submit" size="sm" disabled={adjustPending}>
                {adjustPending ? 'Guardando...' : 'Agregar ajuste'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!readOnly ? (
      <div className="flex flex-wrap gap-2">
        {canApproveNow && (
          <form action={approveAction}>
            <input type="hidden" name="settlementId" value={settlement.id} />
            <Button type="submit" disabled={approvePending}>
              {approvePending ? 'Aprobando...' : 'Aprobar liquidación'}
            </Button>
          </form>
        )}
        {approveState?.error ? (
          <p className="w-full text-sm text-destructive">{approveState.error}</p>
        ) : null}

        {canCancelNow && (
          <form action={cancelAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="settlementId" value={settlement.id} />
            <Input name="reason" placeholder="Motivo de cancelación" className="max-w-xs" />
            <Button type="submit" variant="outline" disabled={cancelPending}>
              {cancelPending ? 'Cancelando...' : 'Cancelar'}
            </Button>
          </form>
        )}
        {cancelState?.error ? (
          <p className="w-full text-sm text-destructive">{cancelState.error}</p>
        ) : null}
      </div>
      ) : null}

      {!readOnly && canRegisterPayment && settlement.balance_due > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrar pago</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={payAction} className="grid max-w-md gap-3">
              <input type="hidden" name="settlementId" value={settlement.id} />
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={settlement.balance_due}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Método</Label>
                <Select name="method" defaultValue="transferencia">
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referencia</Label>
                <Input name="reference" placeholder="CBU, comprobante..." />
              </div>
              {professional?.invoice_required ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nº factura (opcional)</Label>
                      <Input name="invoiceNumber" placeholder="0001-00001234" />
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha factura</Label>
                      <Input name="invoiceDate" type="date" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Importe factura</Label>
                    <Input name="invoiceAmount" type="number" min="0" step="0.01" />
                  </div>
                </>
              ) : null}
              {payState?.error && <p className="text-sm text-destructive">{payState.error}</p>}
              <Button type="submit" disabled={payPending}>
                {payPending ? 'Registrando...' : 'Registrar pago'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
