'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  addSettlementAdjustment,
  approveSettlement,
  cancelSettlement,
  deleteSettlementAdjustment,
  registerProfessionalPayment,
  omitSettlementItem,
  restoreSettlementOmission,
  submitSettlementForReview,
  updateSettlementAdjustment,
  updateSettlementNotes,
  voidProfessionalPayment,
} from '@/actions/professional-settlements';
import { SettlementDetailActions } from '@/components/professionals/settlement-detail-actions';
import { SettlementDuplicateWarnings } from '@/components/professionals/settlement-duplicate-warnings';
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
  type SettlementDuplicateClaimWarning,
} from '@sincvete/shared';

interface SettlementDetailProps {
  settlement: ProfessionalSettlementDetail;
  professional: Professional | null;
  organizationName: string;
  canApprove: boolean;
  canPay: boolean;
  canAdjust: boolean;
  duplicateWarnings?: SettlementDuplicateClaimWarning[];
  readOnly?: boolean;
  showAuditLink?: boolean;
  openCashSessionId?: string | null;
  canPostCashEgreso?: boolean;
}

export function SettlementDetail({
  settlement,
  professional,
  organizationName,
  canApprove,
  canPay,
  canAdjust,
  duplicateWarnings = [],
  readOnly = false,
  showAuditLink = false,
  openCashSessionId = null,
  canPostCashEgreso = false,
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
  const [deleteAdjustState, deleteAdjustAction, deleteAdjustPending] = useActionState(
    deleteSettlementAdjustment,
    null
  );
  const [updateAdjustState, updateAdjustAction, updateAdjustPending] = useActionState(
    updateSettlementAdjustment,
    null
  );
  const [notesState, notesAction, notesPending] = useActionState(updateSettlementNotes, null);
  const [payState, payAction, payPending] = useActionState(registerProfessionalPayment, null);
  const [voidPayState, voidPayAction, voidPayPending] = useActionState(voidProfessionalPayment, null);
  const [omitState, omitAction, omitPending] = useActionState(omitSettlementItem, null);
  const [restoreOmitState, restoreOmitAction, restoreOmitPending] = useActionState(
    restoreSettlementOmission,
    null
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelSettlement, null);
  const [payMethod, setPayMethod] = useState<string>('transferencia');

  useEffect(() => {
    if (
      approveState?.success ||
      submitState?.success ||
      adjustState?.success ||
      deleteAdjustState?.success ||
      updateAdjustState?.success ||
      notesState?.success ||
      payState?.success ||
      voidPayState?.success ||
      omitState?.success ||
      restoreOmitState?.success ||
      cancelState?.success
    ) {
      router.refresh();
    }
  }, [
    approveState,
    submitState,
    adjustState,
    deleteAdjustState,
    updateAdjustState,
    notesState,
    payState,
    voidPayState,
    omitState,
    restoreOmitState,
    cancelState,
    router,
  ]);

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

      {!readOnly && canAdjust && !locked ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas internas</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={notesAction} className="grid max-w-xl gap-3">
              <input type="hidden" name="settlementId" value={settlement.id} />
              <Textarea
                name="notes"
                rows={3}
                maxLength={2000}
                defaultValue={settlement.notes ?? ''}
                placeholder="Observaciones internas de la liquidación"
              />
              {notesState?.error && <p className="text-sm text-destructive">{notesState.error}</p>}
              <Button type="submit" size="sm" disabled={notesPending}>
                {notesPending ? 'Guardando...' : 'Guardar notas'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : settlement.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{settlement.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {!readOnly && canApproveNow ? (
        <SettlementDuplicateWarnings warnings={duplicateWarnings} />
      ) : null}

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
          paymentsAuditHref={
            showAuditLink
              ? `/auditoria?entityType=professional_payments&search=${settlement.id}`
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
            <>
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
                      <div className="flex flex-col items-end gap-2">
                        <span>{formatMoney(item.calculated_amount, currency)}</span>
                        {!readOnly && canAdjust && !locked && item.source_id ? (
                          <form action={omitAction} className="flex flex-wrap items-end gap-1">
                            <input type="hidden" name="itemId" value={item.id} />
                            <Input
                              name="reason"
                              required
                              minLength={3}
                              maxLength={500}
                              placeholder="Motivo exclusión"
                              className="h-8 w-40 text-xs"
                            />
                            <Button type="submit" variant="outline" size="sm" disabled={omitPending}>
                              Excluir
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {omitState?.error ? (
                <p className="mt-2 text-sm text-destructive">{omitState.error}</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {settlement.omissions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ítems excluidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {settlement.omissions.map((omission) => (
              <div
                key={omission.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {SETTLEMENT_ITEM_SOURCE_TYPE_LABELS[omission.source_type]}
                  </p>
                  <p className="text-muted-foreground">{omission.reason}</p>
                </div>
                {!readOnly && canAdjust && !locked ? (
                  <form action={restoreOmitAction}>
                    <input type="hidden" name="omissionId" value={omission.id} />
                    <Button type="submit" variant="ghost" size="sm" disabled={restoreOmitPending}>
                      {restoreOmitPending ? 'Restaurando...' : 'Restaurar'}
                    </Button>
                  </form>
                ) : null}
              </div>
            ))}
            {restoreOmitState?.success ? (
              <p className="text-xs text-muted-foreground">
                Omisión quitada. Recalculá la liquidación para volver a incluir el ítem.
              </p>
            ) : null}
            {restoreOmitState?.error ? (
              <p className="text-sm text-destructive">{restoreOmitState.error}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {settlement.adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes manuales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settlement.adjustments.map((adjustment) => (
              <div key={adjustment.id} className="rounded-md border px-3 py-2 text-sm">
                {!readOnly && canAdjust && !locked ? (
                  <form action={updateAdjustAction} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="adjustmentId" value={adjustment.id} />
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Tipo</Label>
                      <Select name="adjustmentType" defaultValue={adjustment.adjustment_type}>
                        {SETTLEMENT_ADJUSTMENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {SETTLEMENT_ADJUSTMENT_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Monto</Label>
                      <Input
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        defaultValue={adjustment.amount}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Motivo</Label>
                      <Textarea
                        name="reason"
                        rows={2}
                        required
                        minLength={3}
                        defaultValue={adjustment.reason}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button type="submit" size="sm" disabled={updateAdjustPending}>
                        {updateAdjustPending ? 'Guardando...' : 'Guardar'}
                      </Button>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        formAction={deleteAdjustAction}
                        disabled={deleteAdjustPending}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <p className="font-medium">
                      {SETTLEMENT_ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type]}
                    </p>
                    <p>{adjustment.reason}</p>
                    <p>{formatMoney(adjustment.amount, currency)}</p>
                  </div>
                )}
              </div>
            ))}
            {updateAdjustState?.error ? (
              <p className="text-sm text-destructive">{updateAdjustState.error}</p>
            ) : null}
            {deleteAdjustState?.error ? (
              <p className="text-sm text-destructive">{deleteAdjustState.error}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {settlement.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagos registrados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {settlement.payments.map((payment) => {
              const voided = Boolean(payment.deleted_at);
              return (
                <div
                  key={payment.id}
                  className={`rounded-md border px-3 py-2 text-sm ${voided ? 'border-dashed opacity-80' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {formatMoney(payment.amount, payment.currency)}
                    </p>
                    {voided ? <Badge variant="default">Anulado</Badge> : null}
                  </div>
                  <p className="text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[payment.method]} · {payment.paid_at.slice(0, 10)}
                    {payment.reference ? ` · Ref ${payment.reference}` : ''}
                    {payment.invoice_number ? ` · FC ${payment.invoice_number}` : ''}
                  </p>
                  {voided && payment.deleted_at ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Anulado el {payment.deleted_at.slice(0, 16).replace('T', ' ')}
                    </p>
                  ) : null}
                  {payment.notes ? (
                    <p className="mt-1 text-muted-foreground">
                      {voided && payment.notes.startsWith('Anulado:')
                        ? payment.notes
                        : payment.notes}
                    </p>
                  ) : null}
                  {payment.invoice_attachment_url ? (
                    <a
                      href={payment.invoice_attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-sm text-primary hover:underline"
                    >
                      Ver adjunto factura
                    </a>
                  ) : null}
                  {payment.cash_session_id && !voided ? (
                    <Link
                      href={`/caja/${payment.cash_session_id}`}
                      className="mt-1 inline-block text-sm text-primary hover:underline"
                    >
                      Ver egreso en caja
                    </Link>
                  ) : null}
                  {!readOnly && canPay && !voided ? (
                    <form
                      action={voidPayAction}
                      className="mt-2 grid max-w-md gap-2"
                      onSubmit={(event) => {
                        const confirmed = window.confirm(
                          payment.cash_session_id
                            ? '¿Anular este pago? Se recalcula el saldo y se elimina el egreso de caja vinculado.'
                            : '¿Anular este pago? El saldo de la liquidación se recalcula.'
                        );
                        if (!confirmed) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <Input
                        name="reason"
                        required
                        minLength={3}
                        maxLength={500}
                        placeholder="Motivo de anulación (obligatorio)"
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={voidPayPending}
                        className="w-fit"
                      >
                        {voidPayPending ? 'Anulando...' : 'Anular pago'}
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
            {voidPayState?.error ? (
              <p className="text-sm text-destructive">{voidPayState.error}</p>
            ) : null}
            {voidPayState?.success ? (
              <div className="space-y-1 text-sm text-emerald-700 dark:text-emerald-400">
                <p>
                  {voidPayState.data?.cashReversed
                    ? 'Pago anulado y egreso de caja vinculado eliminado.'
                    : 'Pago anulado.'}
                </p>
                {voidPayState.data?.cashWarning ? (
                  <p className="text-amber-700 dark:text-amber-400">{voidPayState.data.cashWarning}</p>
                ) : null}
                {voidPayState.data?.cashSessionId ? (
                  <Link
                    href={`/caja/${voidPayState.data.cashSessionId}`}
                    className="font-medium underline underline-offset-2"
                  >
                    Ver sesión de caja
                  </Link>
                ) : (
                  <Link href="/caja" className="font-medium underline underline-offset-2">
                    Ir a caja
                  </Link>
                )}
              </div>
            ) : null}
            {!readOnly && canPay ? (
              <p className="text-xs text-muted-foreground">
                Si el pago tenía egreso vinculado en caja, se elimina al anular.
              </p>
            ) : null}
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
          <form
            action={approveAction}
            onSubmit={(event) => {
              const warningCount = duplicateWarnings.length;
              const confirmed = window.confirm(
                warningCount > 0
                  ? `Hay ${warningCount} advertencia${warningCount !== 1 ? 's' : ''} de reclamos duplicados. ¿Aprobar igual?`
                  : '¿Aprobar esta liquidación? Quedará lista para pago.'
              );
              if (!confirmed) event.preventDefault();
            }}
          >
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
          <form
            action={cancelAction}
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              const confirmed = window.confirm(
                '¿Cancelar esta liquidación? Quedará fuera del flujo de pago.'
              );
              if (!confirmed) event.preventDefault();
            }}
          >
            <input type="hidden" name="settlementId" value={settlement.id} />
            <Input
              name="reason"
              placeholder="Motivo de cancelación"
              className="max-w-xs"
              minLength={3}
            />
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
                  defaultValue={settlement.balance_due}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Método</Label>
                <Select
                  name="method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha de pago</Label>
                <Input
                  name="paidAt"
                  type="datetime-local"
                  defaultValue={new Date().toISOString().slice(0, 16)}
                />
              </div>
              <div className="space-y-2">
                <Label>Referencia</Label>
                <Input name="reference" placeholder="CBU, comprobante..." />
              </div>
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Textarea name="notes" rows={2} maxLength={500} placeholder="Observación del pago" />
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
                  <div className="space-y-2">
                    <Label>URL adjunto factura (opcional)</Label>
                    <Input
                      name="invoiceAttachmentUrl"
                      type="url"
                      placeholder="https://..."
                      maxLength={500}
                    />
                  </div>
                </>
              ) : null}
              {canPostCashEgreso && openCashSessionId && payMethod === 'efectivo' ? (
                <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2">
                  <input type="hidden" name="cashSessionId" value={openCashSessionId} />
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="postCashEgreso"
                      value="1"
                      className="mt-1"
                      defaultChecked={false}
                    />
                    <span>
                      Registrar egreso en la caja abierta. Vínculo operativo, sin conciliación
                      fiscal.
                    </span>
                  </label>
                </div>
              ) : canPostCashEgreso && payMethod === 'efectivo' && !openCashSessionId ? (
                <p className="text-xs text-muted-foreground">
                  No hay caja abierta para registrar egreso en efectivo.
                </p>
              ) : null}
              {payState?.error && <p className="text-sm text-destructive">{payState.error}</p>}
              {payState?.success && payState.data?.cashError ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">{payState.data.cashError}</p>
              ) : null}
              {payState?.success && payState.data?.cashSessionId ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Egreso registrado en caja.{' '}
                  <Link
                    href={`/caja/${payState.data.cashSessionId}`}
                    className="font-medium underline underline-offset-2"
                  >
                    Abrir sesión de caja
                  </Link>
                </p>
              ) : null}
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
