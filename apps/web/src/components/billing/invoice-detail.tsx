'use client';

import type { ReactNode } from 'react';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageCircle, Plus, Trash2 } from 'lucide-react';
import {
  issueInvoiceAction,
  registerPaymentAction,
  updateInvoice,
  voidInvoiceAction,
} from '@/actions/billing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  INVOICE_SERVICE_PRESETS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  formatMoney,
  buildWhatsAppComposePath,
  type InvoiceItem,
  type InvoiceListRow,
  type PaymentListRow,
} from '@sincvete/shared';

interface InvoiceDetailProps {
  invoice: InvoiceListRow;
  items: InvoiceItem[];
  payments: PaymentListRow[];
  canWrite: boolean;
  canSendWhatsApp?: boolean;
  listHref?: string;
}

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export function InvoiceDetail({
  invoice,
  items,
  payments,
  canWrite,
  canSendWhatsApp = false,
  listHref = '/facturacion',
}: InvoiceDetailProps) {
  const router = useRouter();
  const isDraft = invoice.status === 'borrador';
  const canOperate = canWrite && isDraft;
  const canPay = canWrite && invoice.status === 'emitida' && invoice.balance > 0;
  const canVoid =
    canWrite && (invoice.status === 'borrador' || invoice.status === 'emitida') && invoice.paid_amount === 0;

  const updateAction = updateInvoice.bind(null, invoice.id);
  const payAction = registerPaymentAction.bind(null, invoice.id);
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, null);
  const [payState, payFormAction, payPending] = useActionState(payAction, null);
  const [lineItems, setLineItems] = useState<LineItem[]>(
    items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unit_price),
    }))
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [voidPending, setVoidPending] = useState(false);
  const [issuePending, setIssuePending] = useState(false);

  const draftTotal = lineItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  const handleIssue = async () => {
    setActionError(null);
    setIssuePending(true);
    try {
      const result = await issueInvoiceAction(invoice.id);
      if (!result.success) {
        setActionError(result.error ?? 'No se pudo emitir la factura');
        return;
      }
      router.refresh();
    } finally {
      setIssuePending(false);
    }
  };

  const handleVoid = async () => {
    setActionError(null);
    setVoidPending(true);
    try {
      const result = await voidInvoiceAction(invoice.id);
      if (!result.success) {
        setActionError(result.error ?? 'No se pudo anular la factura');
        return;
      }
      router.refresh();
    } finally {
      setVoidPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={voidConfirmOpen}
        title="Anular factura"
        description="¿Anular esta factura? Esta acción no se puede deshacer."
        confirmLabel="Anular"
        variant="destructive"
        onClose={() => setVoidConfirmOpen(false)}
        onConfirm={() => {
          void handleVoid();
        }}
      />
      <ConfirmDialog
        open={Boolean(actionError)}
        mode="alert"
        title="No se pudo completar"
        description={actionError ?? ''}
        onClose={() => setActionError(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={listHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a facturación
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canSendWhatsApp && invoice.status !== 'borrador' && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={buildWhatsAppComposePath({
                  ownerId: invoice.owner_id,
                  patientId: invoice.patient_id ?? undefined,
                  invoiceId: invoice.id,
                  template: 'factura_saldo',
                })}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Link>
            </Button>
          )}
          {invoice.consultation_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${invoice.consultation_id}`}>Ver consulta</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{invoice.number ?? 'Borrador'}</CardTitle>
            <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatMoney(invoice.total, invoice.currency)}
            {invoice.status === 'emitida'
              ? ` · saldo ${formatMoney(invoice.balance, invoice.currency)}`
              : ''}
            {invoice.issued_at ? ` · ${formatClinicalEntryDateTime(invoice.issued_at)}` : ''}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Propietario"
            value={
              <Link href={`/propietarios/${invoice.owner_id}`} className="text-primary hover:underline">
                {invoice.owner_full_name}
              </Link>
            }
          />
          <DetailField
            label="Paciente"
            value={
              invoice.patient_id && invoice.patient_name ? (
                <Link href={`/pacientes/${invoice.patient_id}`} className="text-primary hover:underline">
                  {invoice.patient_species ? `${SPECIES_EMOJI[invoice.patient_species]} ` : ''}
                  {invoice.patient_name}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <DetailField
            label="Vencimiento"
            value={invoice.due_at}
          />
          <DetailField label="Pagado" value={formatMoney(invoice.paid_amount, invoice.currency)} />
          {!canOperate && (
            <>
              <div className="sm:col-span-2">
                <DetailField label="Notas" value={invoice.notes} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Ítems</p>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
                      <span>{item.description}</span>
                      <span className="text-muted-foreground">
                        {item.quantity} × {formatMoney(item.unit_price, invoice.currency)} ={' '}
                        {formatMoney(item.line_total, invoice.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canOperate && (
        <Card>
          <CardHeader>
            <CardTitle>Editar borrador</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateFormAction} className="grid max-w-3xl gap-4">
              <div className="space-y-2">
                <Label htmlFor="dueAt">Vencimiento</Label>
                <Input id="dueAt" name="dueAt" type="date" defaultValue={invoice.due_at ?? ''} />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Ítems *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setLineItems((current) => [
                        ...current,
                        { description: '', quantity: '1', unitPrice: '0' },
                      ])
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar
                  </Button>
                </div>
                {lineItems.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12">
                    <div className="space-y-2 sm:col-span-12">
                      <Select
                        defaultValue=""
                        onChange={(e) => {
                          const preset = INVOICE_SERVICE_PRESETS.find(
                            (row) => row.description === e.target.value
                          );
                          if (!preset) return;
                          setLineItems((current) =>
                            current.map((row, i) =>
                              i === index
                                ? {
                                    description: preset.description,
                                    quantity: row.quantity || '1',
                                    unitPrice: String(preset.unitPrice),
                                  }
                                : row
                            )
                          );
                        }}
                      >
                        <option value="">Plantilla</option>
                        {INVOICE_SERVICE_PRESETS.map((preset) => (
                          <option key={preset.description} value={preset.description}>
                            {preset.description}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-6">
                      <Input
                        name="description"
                        required
                        value={item.description}
                        onChange={(e) =>
                          setLineItems((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, description: e.target.value } : row
                            )
                          )
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        name="quantity"
                        type="number"
                        min="0"
                        step="any"
                        required
                        value={item.quantity}
                        onChange={(e) =>
                          setLineItems((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, quantity: e.target.value } : row
                            )
                          )
                        }
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        name="unitPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={item.unitPrice}
                        onChange={(e) =>
                          setLineItems((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, unitPrice: e.target.value } : row
                            )
                          )
                        }
                      />
                    </div>
                    <div className="sm:col-span-1">
                      {lineItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setLineItems((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-sm font-medium">
                  Total {formatMoney(draftTotal, invoice.currency)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={invoice.notes ?? ''} />
              </div>
              {updateState?.error && <p className="text-sm text-destructive">{updateState.error}</p>}
              {updateState?.success && (
                <p className="text-sm text-muted-foreground">Borrador guardado.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" disabled={updatePending}>
                  {updatePending ? 'Guardando...' : 'Guardar'}
                </Button>
                <Button
                  type="button"
                  disabled={updatePending || issuePending}
                  isPending={issuePending}
                  onClick={() => void handleIssue()}
                >
                  Emitir
                </Button>
                {canVoid && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={updatePending || voidPending}
                    isPending={voidPending}
                    onClick={() => setVoidConfirmOpen(true)}
                  >
                    Anular
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canPay && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar pago</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={payFormAction} className="grid max-w-xl gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Importe *</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={invoice.balance}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="method">Medio *</Label>
                  <Select id="method" name="method" defaultValue="efectivo">
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Referencia</Label>
                <Input id="reference" name="reference" placeholder="N° de transferencia, cupón..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payNotes">Notas</Label>
                <Textarea id="payNotes" name="notes" rows={2} />
              </div>
              {payState?.error && <p className="text-sm text-destructive">{payState.error}</p>}
              {payState?.success && (
                <p className="text-sm text-muted-foreground">Pago registrado.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={payPending}>
                  {payPending ? 'Registrando...' : 'Cobrar'}
                </Button>
                {canVoid && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={voidPending}
                    isPending={voidPending}
                    onClick={() => setVoidConfirmOpen(true)}
                  >
                    Anular factura
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{formatMoney(payment.amount, invoice.currency)}</span>
                    <span>{PAYMENT_METHOD_LABELS[payment.method]}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {formatClinicalEntryDateTime(payment.paid_at)}
                    {payment.recorded_by_name ? ` · ${payment.recorded_by_name}` : ''}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                  </p>
                  {payment.notes && <p className="mt-1 whitespace-pre-wrap">{payment.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{value || '—'}</div>
    </div>
  );
}
