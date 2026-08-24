import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getOrganization } from '@/actions/settings';
import { getOwner } from '@/actions/owners';
import { getPatient } from '@/actions/patients';
import { getAppointment } from '@/actions/appointments';
import { getInvoice } from '@/actions/billing';
import { getLabOrder } from '@/actions/lab';
import { getVaccination } from '@/actions/vaccinations';
import { canAccessWhatsApp, canSendWhatsApp, listWhatsAppMessages } from '@/actions/whatsapp';
import { WhatsAppComposeForm } from '@/components/whatsapp/whatsapp-compose-form';
import { WhatsAppHistory } from '@/components/whatsapp/whatsapp-history';
import { FeatureUnavailableNotice } from '@/components/entitlements/feature-gate';
import { getMeteredUsageMeters } from '@/lib/entitlements';
import { getSessionContext } from '@/lib/session';
import {
  WHATSAPP_TEMPLATES,
  formatAppointmentTime,
  formatDashboardDate,
  formatMoney,
  formatVaccinationDate,
  parseOrganizationSettings,
  FEATURES,
  type WhatsAppRelatedType,
  type WhatsAppTemplateKey,
  type WhatsAppTemplateVars,
} from '@sincvete/shared';

interface WhatsAppPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    ownerId?: string;
    patientId?: string;
    template?: string;
    appointmentId?: string;
    invoiceId?: string;
    labOrderId?: string;
    vaccinationId?: string;
    room?: string;
  }>;
}

export default async function WhatsAppPage({ searchParams }: WhatsAppPageProps) {
  const canAccess = await canAccessWhatsApp();
  if (!canAccess) redirect('/dashboard');

  const canSend = await canSendWhatsApp();

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const templateParam = params.template?.trim() ?? '';
  const template = WHATSAPP_TEMPLATES.includes(templateParam as WhatsAppTemplateKey)
    ? (templateParam as WhatsAppTemplateKey)
    : undefined;

  const organization = await getOrganization();
  const clinicName = organization?.name ?? 'la clínica';
  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

  let ownerId = params.ownerId?.trim() || '';
  let ownerName = '';
  let patientId = params.patientId?.trim() || '';
  let patientName = '';
  let phone = '';
  let relatedType: WhatsAppRelatedType = 'none';
  let relatedId: string | undefined;
  const vars: WhatsAppTemplateVars = { clinic: clinicName };
  let resolvedTemplate = template ?? 'mensaje_libre';

  if (params.appointmentId) {
    const appointment = await getAppointment(params.appointmentId).catch(() => null);
    if (appointment) {
      ownerId = appointment.owner_id;
      ownerName = appointment.owner_full_name;
      patientId = appointment.patient_id;
      patientName = appointment.patient_name;
      relatedType = 'appointment';
      relatedId = appointment.id;
      vars.owner = appointment.owner_full_name;
      vars.patient = appointment.patient_name;
      vars.date = formatDashboardDate(appointment.starts_at);
      vars.time = formatAppointmentTime(appointment.starts_at);
      if (params.room?.trim()) {
        vars.room = params.room.trim();
      }
      resolvedTemplate = template ?? 'recordatorio_cita';
    }
  } else if (params.invoiceId) {
    const data = await getInvoice(params.invoiceId).catch(() => null);
    if (data) {
      ownerId = data.invoice.owner_id;
      ownerName = data.invoice.owner_full_name;
      patientId = data.invoice.patient_id ?? '';
      patientName = data.invoice.patient_name ?? '';
      relatedType = 'invoice';
      relatedId = data.invoice.id;
      vars.owner = data.invoice.owner_full_name;
      vars.patient = data.invoice.patient_name ?? 'tu mascota';
      vars.invoice = data.invoice.number ?? '';
      vars.amount = formatMoney(data.invoice.balance, data.invoice.currency || currency);
      resolvedTemplate = template ?? 'factura_saldo';
    }
  } else if (params.labOrderId) {
    const data = await getLabOrder(params.labOrderId).catch(() => null);
    if (data) {
      ownerId = data.order.owner_id;
      ownerName = data.order.owner_full_name;
      patientId = data.order.patient_id;
      patientName = data.order.patient_name;
      relatedType = 'lab_order';
      relatedId = data.order.id;
      vars.owner = data.order.owner_full_name;
      vars.patient = data.order.patient_name;
      resolvedTemplate = template ?? 'lab_listo';
    }
  } else if (params.vaccinationId) {
    const vaccination = await getVaccination(params.vaccinationId).catch(() => null);
    if (vaccination) {
      ownerId = vaccination.owner_id;
      ownerName = vaccination.owner_full_name;
      patientId = vaccination.patient_id;
      patientName = vaccination.patient_name;
      relatedType = 'vaccination';
      relatedId = vaccination.id;
      vars.owner = vaccination.owner_full_name;
      vars.patient = vaccination.patient_name;
      vars.vaccine = vaccination.vaccine_name;
      vars.date = formatVaccinationDate(vaccination.next_due_at);
      resolvedTemplate = template ?? 'vacuna_vencida';
    }
  }

  if (ownerId) {
    const owner = await getOwner(ownerId).catch(() => null);
    if (owner) {
      ownerName = owner.full_name;
      phone = owner.phone_whatsapp || owner.phone || '';
      vars.owner = owner.full_name;
    }
  }

  if (patientId) {
    const patient = await getPatient(patientId).catch(() => null);
    if (patient) {
      patientName = patient.name;
      vars.patient = patient.name;
      if (!ownerId) ownerId = patient.owner_id;
    }
  }

  const [history, session] = await Promise.all([
    listWhatsAppMessages({
      page,
      pageSize: 25,
      search: search || undefined,
    }),
    getSessionContext(),
  ]);
  const usage = session
    ? (await getMeteredUsageMeters(session.organizationId)).find(
        (meter) => meter.featureKey === FEATURES.WHATSAPP_MONTHLY_MESSAGES
      )
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-muted-foreground">
          Plantillas y click-to-chat con tutores. No requiere API de Meta.
        </p>
      </div>

      {canSend ? (
        <WhatsAppComposeForm
          clinicName={clinicName}
          defaultOwnerId={ownerId || undefined}
          defaultOwnerName={ownerName || undefined}
          defaultPatientId={patientId || undefined}
          defaultPatientName={patientName || undefined}
          defaultPhone={phone || undefined}
          defaultTemplate={resolvedTemplate}
          relatedType={relatedType}
          relatedId={relatedId}
          vars={vars}
          usage={usage}
        />
      ) : (
        <FeatureUnavailableNotice
          title="WhatsApp no incluido"
          description="El envío por WhatsApp forma parte de planes superiores. Contactá a SyncVete para habilitarlo."
        />
      )}

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <WhatsAppHistory data={history} initialSearch={search} />
      </Suspense>
    </div>
  );
}
