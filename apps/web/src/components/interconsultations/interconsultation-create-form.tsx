'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  INTERCONSULTATION_PRIORITY_LABELS,
  computeInterconsultationClientAmount,
  formatInterconsultationMoney,
  type Professional,
} from '@sincvete/shared';
import { createInterconsultation, requestMultipleProfessionalQuotes } from '@/actions/interconsultations';
import { PatientPicker } from '@/components/appointments/patient-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ExternalPro = {
  externalProfessionalName: string;
  externalProfessionalEmail: string;
  externalProfessionalPhone: string;
};

export function InterconsultationCreateForm({
  professionals,
  currency,
  defaultBranchId,
}: {
  professionals: Professional[];
  currency: string;
  defaultBranchId?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [clinicalQuestion, setClinicalQuestion] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [markup, setMarkup] = useState(20);
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<string[]>([]);
  const [externals, setExternals] = useState<ExternalPro[]>([]);
  const [previewBase] = useState(10000);
  const [sendLinks, setSendLinks] = useState<
    Array<{ requestId: string; url: string; whatsappMessage: string }>
  >([]);

  const commercial = useMemo(
    () =>
      computeInterconsultationClientAmount({
        professionalBaseAmount: previewBase,
        clinicMarkupPercentage: markup,
      }),
    [markup, previewBase]
  );

  function toggleProfessional(id: string) {
    setSelectedProfessionalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function readPatientIds(): { patientId: string; ownerId: string } {
    const patientId =
      (document.querySelector('input[name="patientId"]') as HTMLInputElement | null)?.value ?? '';
    const ownerId =
      (document.querySelector('input[name="ownerId"]') as HTMLInputElement | null)?.value ?? '';
    return { patientId, ownerId };
  }

  function goNext() {
    setError(null);
    if (step === 1) {
      const { patientId, ownerId } = readPatientIds();
      if (!patientId || !ownerId) {
        setError('Seleccioná un paciente');
        return;
      }
    }
    if (step === 2 && (!title.trim() || !clinicalQuestion.trim())) {
      setError('Completá título y pregunta clínica');
      return;
    }
    if (step === 3) {
      const hasInternal = selectedProfessionalIds.length > 0;
      const hasExternal = externals.some((e) => e.externalProfessionalName.trim());
      if (!hasInternal && !hasExternal) {
        setError('Elegí al menos un profesional');
        return;
      }
    }
    if (step === 5) {
      submitAll();
      return;
    }
    setStep((s) => s + 1);
  }

  function submitAll() {
    setError(null);
    const { patientId, ownerId } = readPatientIds();
    if (!patientId || !ownerId) {
      setError('Seleccioná un paciente');
      setStep(1);
      return;
    }

    const formData = new FormData();
    formData.set('patientId', patientId);
    formData.set('ownerId', ownerId);
    formData.set('title', title);
    formData.set('clinicalQuestion', clinicalQuestion);
    formData.set('clinicalSummary', clinicalSummary);
    formData.set('priority', priority);
    formData.set('clinicMarkupPercentage', String(markup));
    if (defaultBranchId) formData.set('branchId', defaultBranchId);

    startTransition(async () => {
      const created = await createInterconsultation(null, formData);
      if (!created.success || !created.data?.id) {
        setError(created.error || 'No se pudo crear');
        return;
      }

      const professionalsPayload = [
        ...selectedProfessionalIds.map((professionalId) => ({ professionalId })),
        ...externals
          .filter((e) => e.externalProfessionalName.trim())
          .map((e) => ({
            externalProfessionalName: e.externalProfessionalName.trim(),
            externalProfessionalEmail: e.externalProfessionalEmail.trim() || null,
            externalProfessionalPhone: e.externalProfessionalPhone.trim() || null,
          })),
      ];

      if (professionalsPayload.length === 0) {
        router.push(`/interconsultas/${created.data.id}`);
        return;
      }

      const sendData = new FormData();
      sendData.set('interconsultationId', created.data.id);
      sendData.set('professionals', JSON.stringify(professionalsPayload));
      const sent = await requestMultipleProfessionalQuotes(null, sendData);
      if (!sent.success) {
        setError(sent.error || 'Creada, pero no se pudieron enviar las solicitudes');
        router.push(`/interconsultas/${created.data.id}`);
        return;
      }
      setSendLinks(sent.data?.tokens ?? []);
      setStep(6);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {['Paciente', 'Motivo', 'Profesionales', 'Comercial', 'Enviar'].map((label, index) => (
          <span
            key={label}
            className={
              step === index + 1
                ? 'font-semibold text-foreground'
                : step > index + 1
                  ? 'opacity-70'
                  : ''
            }
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* Keep PatientPicker mounted so hidden patientId/ownerId survive step changes */}
      <div className={step === 1 ? 'space-y-4 rounded-lg border p-4' : 'hidden'}>
        <h2 className="text-lg font-semibold">Paciente</h2>
        <PatientPicker defaultBranchId={defaultBranchId} />
        <p className="text-sm text-muted-foreground">
          El propietario se deriva automáticamente del paciente seleccionado.
        </p>
      </div>

      {step === 2 ? (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Motivo</h2>
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="Ej. Evaluación cardiológica"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinicalQuestion">Pregunta clínica</Label>
            <Textarea
              id="clinicalQuestion"
              value={clinicalQuestion}
              onChange={(e) => setClinicalQuestion(e.target.value)}
              required
              rows={4}
              maxLength={8000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinicalSummary">Resumen clínico relevante (opcional)</Label>
            <Textarea
              id="clinicalSummary"
              value={clinicalSummary}
              onChange={(e) => setClinicalSummary(e.target.value)}
              rows={3}
              maxLength={8000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Prioridad</Label>
            <select
              id="priority"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
            >
              {Object.entries(INTERCONSULTATION_PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Profesionales</h2>
          <p className="text-sm text-muted-foreground">
            Podés elegir uno o varios profesionales internos y/o externos.
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {professionals.map((pro) => (
              <label
                key={pro.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selectedProfessionalIds.includes(pro.id)}
                  onChange={() => toggleProfessional(pro.id)}
                />
                <span>
                  {pro.first_name} {pro.last_name}
                  {pro.specialty ? (
                    <span className="text-muted-foreground"> · {pro.specialty}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Externos</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setExternals((prev) => [
                    ...prev,
                    {
                      externalProfessionalName: '',
                      externalProfessionalEmail: '',
                      externalProfessionalPhone: '',
                    },
                  ])
                }
              >
                Agregar externo
              </Button>
            </div>
            {externals.map((ext, index) => (
              <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
                <Input
                  placeholder="Nombre"
                  value={ext.externalProfessionalName}
                  onChange={(e) =>
                    setExternals((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, externalProfessionalName: e.target.value } : row
                      )
                    )
                  }
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={ext.externalProfessionalEmail}
                  onChange={(e) =>
                    setExternals((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, externalProfessionalEmail: e.target.value } : row
                      )
                    )
                  }
                />
                <Input
                  placeholder="WhatsApp / teléfono"
                  value={ext.externalProfessionalPhone}
                  onChange={(e) =>
                    setExternals((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, externalProfessionalPhone: e.target.value } : row
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Configuración comercial</h2>
          <p className="text-sm text-muted-foreground">
            El markup se aplica sobre el presupuesto profesional aceptado. Ejemplo con base de
            referencia:
          </p>
          <div className="space-y-2">
            <Label htmlFor="markup">Markup de la clínica (%)</Label>
            <Input
              id="markup"
              type="number"
              min={0}
              step={0.01}
              value={markup}
              onChange={(e) => setMarkup(Number(e.target.value) || 0)}
            />
          </div>
          <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Monto profesional</p>
              <p className="font-medium tabular-nums">
                {formatInterconsultationMoney(previewBase, currency)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Margen clínica</p>
              <p className="font-medium tabular-nums">
                {formatInterconsultationMoney(commercial.clinicMarkupAmount, currency)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Precio cliente</p>
              <p className="font-medium tabular-nums">
                {formatInterconsultationMoney(commercial.clientFinalAmount, currency)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Confirmar envío</h2>
          <p className="text-sm text-muted-foreground">
            Al confirmar se creará la interconsulta y se generarán enlaces seguros (email/WhatsApp
            preparados). No se envía automáticamente ningún mensaje.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Internos: {selectedProfessionalIds.length}</li>
            <li>Externos: {externals.filter((e) => e.externalProfessionalName.trim()).length}</li>
            <li>Markup: {markup}%</li>
          </ul>
        </div>
      ) : null}

      {step === 6 ? (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Enlaces seguros generados</h2>
          <p className="text-sm text-muted-foreground">
            Copiá el enlace o el mensaje de WhatsApp preparado.
          </p>
          <div className="space-y-3">
            {sendLinks.map((link) => (
              <div key={link.requestId} className="rounded-md border p-3 text-sm">
                <p className="break-all font-mono text-xs">{link.url}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(link.url)}
                  >
                    Copiar enlace
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => navigator.clipboard.writeText(link.whatsappMessage)}
                  >
                    Copiar mensaje WhatsApp
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button type="button" onClick={() => router.push('/interconsultas')}>
            Ir al listado
          </Button>
        </div>
      ) : null}

      {step < 6 ? (
        <div className="flex justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 1 || pending}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            Atrás
          </Button>
          <Button type="button" isPending={pending} onClick={goNext}>
            {step === 5 ? 'Crear y generar enlaces' : 'Siguiente'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
