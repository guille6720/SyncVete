'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWhatsAppRecipient, logWhatsAppMessage } from '@/actions/whatsapp';
import { WhatsAppOwnerPicker } from '@/components/whatsapp/whatsapp-owner-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_LABELS,
  formatMeteredUsage,
  isQuotaNearLimit,
  renderWhatsAppTemplate,
  type MeteredUsageMeter,
  type WhatsAppRelatedType,
  type WhatsAppTemplateKey,
  type WhatsAppTemplateVars,
} from '@sincvete/shared';

interface WhatsAppComposeFormProps {
  clinicName: string;
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  defaultPatientId?: string;
  defaultPatientName?: string;
  defaultPhone?: string;
  defaultTemplate?: WhatsAppTemplateKey;
  relatedType?: WhatsAppRelatedType;
  relatedId?: string;
  vars?: WhatsAppTemplateVars;
  usage?: MeteredUsageMeter | null;
}

export function WhatsAppComposeForm({
  clinicName,
  defaultOwnerId = '',
  defaultOwnerName = '',
  defaultPatientId = '',
  defaultPatientName = '',
  defaultPhone = '',
  defaultTemplate = 'mensaje_libre',
  relatedType = 'none',
  relatedId,
  vars = {},
  usage = null,
}: WhatsAppComposeFormProps) {
  const [templateKey, setTemplateKey] = useState<WhatsAppTemplateKey>(defaultTemplate);
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [patientId, setPatientId] = useState(defaultPatientId);
  const [patientName, setPatientName] = useState(defaultPatientName);
  const [phone, setPhone] = useState(defaultPhone);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const mergedVars = useMemo<WhatsAppTemplateVars>(
    () => ({ clinic: clinicName, ...vars }),
    [clinicName, vars]
  );

  const [body, setBody] = useState(() => renderWhatsAppTemplate(defaultTemplate, mergedVars));

  useEffect(() => {
    setBody(renderWhatsAppTemplate(templateKey, mergedVars));
  }, [templateKey, mergedVars]);

  const handleOwnerChange = async (owner: { id: string; full_name: string } | null) => {
    if (!owner) {
      setOwnerId('');
      setPhone('');
      setPatientId('');
      setPatientName('');
      return;
    }
    setOwnerId(owner.id);
    if (owner.id !== defaultOwnerId) {
      setPatientId('');
      setPatientName('');
    }
    const recipient = await getWhatsAppRecipient(owner.id);
    setPhone(recipient?.phoneRaw ?? '');
  };

  const handleSubmit = async (formData: FormData) => {
    setPending(true);
    setError(null);
    const result = await logWhatsAppMessage(formData);
    setPending(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'No se pudo abrir WhatsApp');
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card data-tour="whatsapp-compose">
      <CardHeader>
        <CardTitle>Nuevo mensaje</CardTitle>
        <CardDescription>
          Se abre WhatsApp con el texto listo. El envío lo confirma el tutor en su teléfono.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="grid max-w-2xl gap-4">
          <input type="hidden" name="ownerId" value={ownerId} />
          {patientId && <input type="hidden" name="patientId" value={patientId} />}
          <input type="hidden" name="templateKey" value={templateKey} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="relatedType" value={relatedType} />
          {relatedId && <input type="hidden" name="relatedId" value={relatedId} />}

          <WhatsAppOwnerPicker
            defaultOwnerId={defaultOwnerId}
            defaultOwnerName={defaultOwnerName}
            onOwnerChange={handleOwnerChange}
          />

          {patientName && (
            <p className="text-sm text-muted-foreground">Paciente: {patientName}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="templateSelect">Plantilla</Label>
            <Select
              id="templateSelect"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value as WhatsAppTemplateKey)}
            >
              {WHATSAPP_TEMPLATES.map((key) => (
                <option key={key} value={key}>
                  {WHATSAPP_TEMPLATE_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Mensaje</Label>
            <Textarea
              id="body"
              name="body"
              rows={5}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Teléfono: {phone || 'Seleccioná un propietario con WhatsApp o teléfono'}
          </p>

          {usage ? (
            <p className={isQuotaNearLimit(usage) ? 'text-sm text-amber-700' : 'text-sm text-muted-foreground'}>
              Uso del mes: {formatMeteredUsage(usage)}
            </p>
          ) : null}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={pending || !phone || !ownerId}>
            {pending ? 'Abriendo...' : 'Abrir WhatsApp'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
