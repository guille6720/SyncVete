'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  INTERCONSULTATION_PRIORITY_LABELS,
  INTERCONSULTATION_QUOTE_STATUS_LABELS,
  INTERCONSULTATION_REQUEST_STATUS_LABELS,
  INTERCONSULTATION_STATUS_LABELS,
  formatInterconsultationMoney,
  type InterconsultationDetail,
} from '@sincvete/shared';
import {
  approveInterconsultationQuote,
  attachInterconsultationToInvoice,
  cancelInterconsultation,
  markInterconsultationCompleted,
  rejectInterconsultationQuote,
  resendInterconsultationRequest,
} from '@/actions/interconsultations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function InterconsultationDetailClient({
  detail,
  canWrite,
  canApprove,
  canBill,
  draftSettlements,
}: {
  detail: InterconsultationDetail;
  canWrite: boolean;
  canApprove: boolean;
  canBill: boolean;
  draftSettlements: Array<{ id: string; professional_id: string; period_start: string; period_end: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<{ url: string; whatsappMessage: string } | null>(
    null
  );

  function run(action: () => Promise<{ success: boolean; error?: string; data?: unknown }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setMessage(result.error || 'No se pudo completar');
        return;
      }
      setMessage('Listo');
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/interconsultas" className="text-sm text-muted-foreground hover:underline">
            ← Interconsultas
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{detail.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{INTERCONSULTATION_STATUS_LABELS[detail.status]}</Badge>
            <Badge variant={detail.priority === 'urgent' ? 'warning' : 'default'}>
              {INTERCONSULTATION_PRIORITY_LABELS[detail.priority]}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && !['completed', 'cancelled'].includes(detail.status) ? (
            <Button
              variant="destructive"
              size="sm"
              isPending={pending}
              onClick={() => {
                if (confirm('¿Cancelar esta interconsulta?')) {
                  run(() => cancelInterconsultation(detail.id));
                }
              }}
            >
              Cancelar
            </Button>
          ) : null}
          {canWrite && ['approved', 'in_progress'].includes(detail.status) ? (
            <Button
              size="sm"
              isPending={pending}
              onClick={() => run(() => markInterconsultationCompleted(detail.id))}
            >
              Marcar completada
            </Button>
          ) : null}
        </div>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 rounded-lg border p-4 lg:col-span-2">
          <h2 className="font-semibold">Contexto clínico</h2>
          <p className="text-sm">
            <span className="text-muted-foreground">Paciente:</span> {detail.patientName}
            {detail.patientSpecies ? ` · ${detail.patientSpecies}` : ''}
            {detail.patientBreed ? ` · ${detail.patientBreed}` : ''}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Propietario:</span> {detail.ownerName}
          </p>
          <p className="whitespace-pre-wrap text-sm">{detail.clinicalQuestion}</p>
          {detail.clinicalSummary ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {detail.clinicalSummary}
            </p>
          ) : null}
          <Link
            href={`/historia-clinica?patientId=${detail.patientId}`}
            className="inline-block text-sm text-primary hover:underline"
          >
            Ver historia clínica del paciente
          </Link>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Comercial</h2>
          <div className="space-y-1 text-sm">
            <p>
              Base profesional:{' '}
              <span className="font-medium tabular-nums">
                {formatInterconsultationMoney(detail.professionalBaseAmount, detail.currency)}
              </span>
            </p>
            <p>
              Markup ({detail.clinicMarkupPercentage}%):{' '}
              <span className="font-medium tabular-nums">
                {formatInterconsultationMoney(detail.clinicMarkupAmount, detail.currency)}
              </span>
            </p>
            <p>
              Precio cliente:{' '}
              <span className="font-medium tabular-nums">
                {formatInterconsultationMoney(detail.clientFinalAmount, detail.currency)}
              </span>
            </p>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Solicitudes</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Profesional</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Enviado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {detail.requests.map((req) => (
                <tr key={req.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {req.professionalName ?? '—'}
                    {req.externalProfessionalEmail ? (
                      <div className="text-xs text-muted-foreground">
                        {req.externalProfessionalEmail}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {INTERCONSULTATION_REQUEST_STATUS_LABELS[req.status]}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {req.sentAt ? new Date(req.sentAt).toLocaleString('es-AR') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canWrite && !['accepted', 'declined', 'cancelled'].includes(req.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        isPending={pending}
                        onClick={() =>
                          run(async () => {
                            const result = await resendInterconsultationRequest(req.id);
                            if (result.success && result.data) setResendInfo(result.data);
                            return result;
                          })
                        }
                      >
                        Reenviar enlace
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {resendInfo ? (
          <div className="rounded-md border p-3 text-sm">
            <p className="break-all font-mono text-xs">{resendInfo.url}</p>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => navigator.clipboard.writeText(resendInfo.whatsappMessage)}
            >
              Copiar mensaje WhatsApp
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Comparación de presupuestos</h2>
        {detail.quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay presupuestos.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Profesional</th>
                  <th className="px-3 py-2">Precio</th>
                  <th className="px-3 py-2">Entrega</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {detail.quotes.map((quote) => (
                  <tr key={quote.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{quote.professionalName ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatInterconsultationMoney(quote.amount, quote.currency)}
                    </td>
                    <td className="px-3 py-2">{quote.estimatedDelivery ?? '—'}</td>
                    <td className="px-3 py-2">
                      {INTERCONSULTATION_QUOTE_STATUS_LABELS[quote.status]}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canApprove && quote.status === 'submitted' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            isPending={pending}
                            onClick={() =>
                              run(async () => {
                                const fd = new FormData();
                                fd.set('quoteId', quote.id);
                                fd.set('interconsultationId', detail.id);
                                return approveInterconsultationQuote(null, fd);
                              })
                            }
                          >
                            Aceptar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            isPending={pending}
                            onClick={() =>
                              run(() => rejectInterconsultationQuote(quote.id, detail.id))
                            }
                          >
                            Rechazar
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail.responses.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Respuestas profesionales</h2>
          {detail.responses.map((response) => (
            <div key={response.id} className="rounded-lg border p-4 text-sm">
              <p className="whitespace-pre-wrap">{response.responseText}</p>
              {response.recommendations ? (
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {response.recommendations}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Facturación</h2>
          {!detail.billingLink ? (
            <p className="text-sm text-muted-foreground">
              Al completar la interconsulta se generará el pendiente de cobro.
            </p>
          ) : detail.billingLink.status === 'pending' && canBill ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set('interconsultationId', detail.id);
                fd.set('createDraft', 'true');
                run(() => attachInterconsultationToInvoice(null, fd));
              }}
            >
              <p className="text-sm text-amber-700 dark:text-amber-300">Pendiente de cobro</p>
              <div className="space-y-1">
                <Label htmlFor="invoiceId">Factura borrador existente (opcional)</Label>
                <Input id="invoiceId" name="invoiceId" placeholder="UUID de factura borrador" />
              </div>
              <Button type="submit" isPending={pending}>
                Agregar a facturación
              </Button>
            </form>
          ) : detail.billingLink.status === 'invoiced' ? (
            <p className="text-sm">
              Facturada
              {detail.billingLink.invoiceId ? (
                <>
                  {' · '}
                  <Link
                    className="text-primary hover:underline"
                    href={`/facturacion/${detail.billingLink.invoiceId}`}
                  >
                    Ver factura
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-sm">{detail.billingLink.status}</p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Liquidación</h2>
          {detail.settlementLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Al completar con profesional interno se genera el pendiente de liquidación.
            </p>
          ) : (
            detail.settlementLinks.map((link) => {
              const drafts = draftSettlements.filter(
                (s) => s.professional_id === link.professionalId
              );
              return (
                <div key={link.id} className="rounded-md border p-3 text-sm">
                  <p>
                    {link.status === 'pending' ? 'Pendiente de liquidación' : 'Vinculada'} ·{' '}
                    {formatInterconsultationMoney(link.amount, detail.currency)}
                  </p>
                  {link.status === 'pending' && canWrite && drafts.length > 0 ? (
                    <form
                      className="mt-2 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        fd.set('interconsultationId', detail.id);
                        fd.set('settlementLinkId', link.id);
                        startTransition(async () => {
                          const { attachInterconsultationToProfessionalSettlement } = await import(
                            '@/actions/interconsultations'
                          );
                          const result = await attachInterconsultationToProfessionalSettlement(
                            null,
                            fd
                          );
                          if (!result.success) setMessage(result.error || 'Error');
                          else {
                            setMessage('Vinculada a liquidación');
                            router.refresh();
                          }
                        });
                      }}
                    >
                      <select
                        name="professionalSettlementId"
                        required
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Elegir liquidación borrador</option>
                        {drafts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.period_start} → {s.period_end}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" isPending={pending}>
                        Vincular a liquidación
                      </Button>
                    </form>
                  ) : link.status === 'pending' ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Creá una liquidación en borrador para este profesional y volvé a vincular.
                    </p>
                  ) : link.professionalSettlementId ? (
                    <Link
                      href={`/liquidaciones/${link.professionalSettlementId}`}
                      className="text-primary hover:underline"
                    >
                      Ver liquidación
                    </Link>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
