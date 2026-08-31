'use client';

import { useState, useTransition } from 'react';
import {
  submitInterconsultationQuoteByToken,
  submitInterconsultationResponseByToken,
} from '@/actions/interconsultations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function InterconsultationExternalResponder({
  token,
  payload,
}: {
  token: string;
  payload: Record<string, unknown>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const clinic = payload.clinic as { name?: string } | undefined;
  const patient = payload.patient as {
    name?: string;
    species?: string;
    breed?: string;
    birthDate?: string;
    sex?: string;
  } | undefined;
  const ic = payload.interconsultation as {
    title?: string;
    clinicalQuestion?: string;
    clinicalSummary?: string | null;
    priority?: string;
    status?: string;
    currency?: string;
  } | undefined;
  const request = payload.request as { status?: string; professionalName?: string } | undefined;
  const quote = payload.quote as { status?: string; amount?: number } | null | undefined;

  const canQuote = request?.status && !['accepted', 'declined', 'cancelled', 'expired'].includes(request.status);
  const canRespond = request?.status === 'accepted';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{clinic?.name ?? 'Clínica'}</p>
        <h1 className="text-2xl font-bold tracking-tight">Interconsulta</h1>
        <p className="text-muted-foreground">{ic?.title}</p>
      </div>

      <section className="rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">Paciente</h2>
        <p className="mt-1">
          {patient?.name}
          {patient?.species ? ` · ${patient.species}` : ''}
          {patient?.breed ? ` · ${patient.breed}` : ''}
          {patient?.sex ? ` · ${patient.sex}` : ''}
        </p>
        {patient?.birthDate ? (
          <p className="text-muted-foreground">Nacimiento: {patient.birthDate}</p>
        ) : null}
      </section>

      <section className="rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">Pregunta clínica</h2>
        <p className="mt-2 whitespace-pre-wrap">{ic?.clinicalQuestion}</p>
        {ic?.clinicalSummary ? (
          <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{ic.clinicalSummary}</p>
        ) : null}
      </section>

      {message ? <p className="text-sm">{message}</p> : null}
      {done ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Gracias. Tu envío fue registrado.
        </p>
      ) : null}

      {canQuote && !done ? (
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await submitInterconsultationQuoteByToken(token, {
                amount: Number(fd.get('amount')),
                estimatedDelivery: String(fd.get('estimatedDelivery') || '') || null,
                professionalMessage: String(fd.get('professionalMessage') || '') || null,
              });
              if (result.ok === false) {
                setMessage(String(result.error || 'No se pudo enviar'));
                return;
              }
              setDone(true);
              setMessage('Presupuesto enviado');
            });
          }}
        >
          <h2 className="font-semibold">Enviar presupuesto</h2>
          {quote?.status === 'submitted' ? (
            <p className="text-xs text-muted-foreground">
              Ya hay un presupuesto enviado ({quote.amount}). Podés reemplazarlo.
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="amount">Monto ({ic?.currency ?? 'ARS'})</Label>
            <Input id="amount" name="amount" type="number" min={0} step="0.01" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="estimatedDelivery">Entrega estimada</Label>
            <Input id="estimatedDelivery" name="estimatedDelivery" maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="professionalMessage">Mensaje</Label>
            <Textarea id="professionalMessage" name="professionalMessage" rows={3} maxLength={4000} />
          </div>
          <Button type="submit" isPending={pending}>
            Enviar presupuesto
          </Button>
        </form>
      ) : null}

      {canRespond && !done ? (
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await submitInterconsultationResponseByToken(token, {
                responseText: String(fd.get('responseText') || ''),
                recommendations: String(fd.get('recommendations') || '') || null,
              });
              if (result.ok === false) {
                setMessage(String(result.error || 'No se pudo enviar'));
                return;
              }
              setDone(true);
              setMessage('Respuesta enviada');
            });
          }}
        >
          <h2 className="font-semibold">Respuesta profesional</h2>
          <div className="space-y-1">
            <Label htmlFor="responseText">Informe</Label>
            <Textarea id="responseText" name="responseText" required rows={6} maxLength={16000} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="recommendations">Recomendaciones</Label>
            <Textarea id="recommendations" name="recommendations" rows={3} maxLength={8000} />
          </div>
          <Button type="submit" isPending={pending}>
            Enviar respuesta
          </Button>
        </form>
      ) : null}
    </div>
  );
}
