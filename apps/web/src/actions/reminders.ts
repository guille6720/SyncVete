'use server';

import { revalidatePath } from 'next/cache';
import {
  buildWhatsAppUrl,
  canAccessReminders,
  formatAppointmentTime,
  formatDashboardDate,
  formatMoney,
  formatVaccinationDate,
  parseClinicReminders,
  parseOrganizationSettings,
  pickOwnerWhatsAppPhone,
  reminderActionSchema,
  reminderTemplateForType,
  renderWhatsAppTemplate,
  type ActionResult,
  type ReminderBoard,
  type ReminderDispatchResult,
  type ReminderType,
  type WhatsAppRelatedType,
  type WhatsAppTemplateVars,
  EMPTY_REMINDER_BOARD,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requireSession } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { getAppointment } from '@/actions/appointments';
import { getInvoice } from '@/actions/billing';
import { getOwner } from '@/actions/owners';
import { getOrganization } from '@/actions/settings';
import { getVaccination } from '@/actions/vaccinations';
import {
  FEATURES,
  consumeMeteredFeature,
  planRestrictionResult,
  requireFeature,
} from '@/lib/entitlements';

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: string }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

function actionError<T = void>(error: unknown): ActionResult<T> {
  if (isNextRedirect(error)) throw error;
  const planError = planRestrictionResult<T>(error);
  if (planError) return planError;
  if (error instanceof PermissionError) {
    return { success: false, error: error.message };
  }
  console.error(error);
  return { success: false, error: 'Ocurrió un error inesperado' };
}

function rpcMessage(error: { message?: string } | null): string {
  const message = error?.message ?? '';
  if (
    message.includes('permisos') ||
    message.includes('recordatorio') ||
    message.includes('Tipo') ||
    message.includes('Estado') ||
    message.includes('Ya se')
  ) {
    return message;
  }
  return 'Ocurrió un error inesperado';
}

function revalidateReminderPaths() {
  revalidatePath('/recordatorios');
  revalidatePath('/whatsapp');
}

export async function canReadReminders(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session) return false;
  return canAccessReminders(session.permissions);
}

export async function listClinicReminders(): Promise<ReminderBoard> {
  const session = await requireSession();
  if (!canAccessReminders(session.permissions)) {
    return EMPTY_REMINDER_BOARD;
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_clinic_reminders', {
    p_branch_id: session.branchId ?? null,
  });

  if (error) throw error;
  return parseClinicReminders(data);
}

async function markReminderLog(
  reminderType: ReminderType,
  relatedId: string,
  status: 'enviado' | 'omitido',
  whatsappMessageId?: string | null
) {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('mark_reminder', {
    p_reminder_type: reminderType,
    p_related_id: relatedId,
    p_status: status,
    p_whatsapp_message_id: whatsappMessageId ?? null,
  });

  if (error) {
    return { success: false as const, error: rpcMessage(error) };
  }
  return { success: true as const };
}

export async function skipReminder(input: {
  reminderType: ReminderType;
  relatedId: string;
}): Promise<ActionResult> {
  try {
    await requirePermission('whatsapp:send');
    const parsed = reminderActionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'Datos inválidos' };
    }

    const marked = await markReminderLog(parsed.data.reminderType, parsed.data.relatedId, 'omitido');
    if (!marked.success) {
      return { success: false, error: marked.error };
    }

    revalidateReminderPaths();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function sendReminder(input: {
  reminderType: ReminderType;
  relatedId: string;
}): Promise<ActionResult<ReminderDispatchResult>> {
  try {
    const session = await requirePermission('whatsapp:send');
    const parsed = reminderActionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'Datos inválidos' };
    }

    const organization = await getOrganization();
    const clinicName = organization?.name ?? 'la clínica';
    const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

    let ownerId = '';
    let patientId: string | null = null;
    let relatedType: WhatsAppRelatedType = 'none';
    const vars: WhatsAppTemplateVars = { clinic: clinicName };

    if (parsed.data.reminderType === 'appointment') {
      const appointment = await getAppointment(parsed.data.relatedId);
      if (!appointment) {
        return { success: false, error: 'Turno no encontrado' };
      }
      ownerId = appointment.owner_id;
      patientId = appointment.patient_id;
      relatedType = 'appointment';
      vars.owner = appointment.owner_full_name;
      vars.patient = appointment.patient_name;
      vars.date = formatDashboardDate(appointment.starts_at);
      vars.time = formatAppointmentTime(appointment.starts_at);
    } else if (parsed.data.reminderType === 'vaccination') {
      const vaccination = await getVaccination(parsed.data.relatedId);
      if (!vaccination) {
        return { success: false, error: 'Vacuna no encontrada' };
      }
      ownerId = vaccination.owner_id;
      patientId = vaccination.patient_id;
      relatedType = 'vaccination';
      vars.owner = vaccination.owner_full_name;
      vars.patient = vaccination.patient_name;
      vars.vaccine = vaccination.vaccine_name;
      vars.date = formatVaccinationDate(vaccination.next_due_at);
    } else {
      const data = await getInvoice(parsed.data.relatedId);
      if (!data) {
        return { success: false, error: 'Factura no encontrada' };
      }
      ownerId = data.invoice.owner_id;
      patientId = data.invoice.patient_id;
      relatedType = 'invoice';
      vars.owner = data.invoice.owner_full_name;
      vars.patient = data.invoice.patient_name ?? 'tu mascota';
      vars.invoice = data.invoice.number ?? '';
      vars.amount = formatMoney(data.invoice.balance, data.invoice.currency || currency);
    }

    const owner = await getOwner(ownerId);
    if (!owner) {
      return { success: false, error: 'Tutor no encontrado' };
    }

    vars.owner = owner.full_name;
    const phoneE164 = pickOwnerWhatsAppPhone(owner.phone_whatsapp, owner.phone);
    if (!phoneE164) {
      return { success: false, error: 'El tutor no tiene un teléfono de WhatsApp válido' };
    }

    const templateKey = reminderTemplateForType(parsed.data.reminderType);
    const body = renderWhatsAppTemplate(templateKey, vars);

    await requireFeature(session.organizationId, FEATURES.WHATSAPP);
    await requireFeature(session.organizationId, FEATURES.WHATSAPP_REMINDERS);
    await consumeMeteredFeature({
      organizationId: session.organizationId,
      featureKey: FEATURES.WHATSAPP_MONTHLY_MESSAGES,
    });

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('log_whatsapp_message', {
      p_owner_id: ownerId,
      p_body: body,
      p_phone_e164: phoneE164,
      p_template_key: templateKey,
      p_patient_id: patientId,
      p_related_type: relatedType,
      p_related_id: parsed.data.relatedId,
      p_branch_id: session.branchId,
    });

    if (error) {
      return { success: false, error: rpcMessage(error) };
    }

    const payload = data as { id?: string } | null;
    const marked = await markReminderLog(
      parsed.data.reminderType,
      parsed.data.relatedId,
      'enviado',
      payload?.id ?? null
    );
    if (!marked.success) {
      return { success: false, error: marked.error };
    }

    revalidateReminderPaths();
    return {
      success: true,
      data: {
        url: buildWhatsAppUrl(phoneE164, body),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}
