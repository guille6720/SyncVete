'use server';

import { revalidatePath } from 'next/cache';
import {
  buildPaginatedResult,
  buildWhatsAppUrl,
  pickOwnerWhatsAppPhone,
  whatsappComposeSchema,
  whatsappListSchema,
  type ActionResult,
  type PaginatedResult,
  type WhatsAppLoggedMessage,
  type WhatsAppMessageListRow,
  type WhatsAppRecipient,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { getOwner } from '@/actions/owners';
import { getPatient } from '@/actions/patients';
import {
  FEATURES,
  canUseFeature,
  consumeMeteredFeature,
  planRestrictionResult,
  requireFeature,
} from '@/lib/entitlements';

function actionError<T = void>(error: unknown): ActionResult<T> {
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
    message.includes('teléfono') ||
    message.includes('mensaje') ||
    message.includes('Tutor') ||
    message.includes('Paciente')
  ) {
    return message;
  }
  return 'Ocurrió un error inesperado';
}

export async function canSendWhatsApp(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session || !session.permissions.includes('whatsapp:send')) return false;
  return canUseFeature({ organizationId: session.organizationId, featureKey: FEATURES.WHATSAPP });
}

export async function canAccessWhatsApp(): Promise<boolean> {
  const session = await getSessionContext();
  return Boolean(session?.permissions.includes('whatsapp:send'));
}

export async function canSendWhatsAppReminders(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session || !session.permissions.includes('whatsapp:send')) return false;
  const [whatsapp, reminders] = await Promise.all([
    canUseFeature({ organizationId: session.organizationId, featureKey: FEATURES.WHATSAPP }),
    canUseFeature({ organizationId: session.organizationId, featureKey: FEATURES.WHATSAPP_REMINDERS }),
  ]);
  return whatsapp && reminders;
}

export async function getWhatsAppRecipient(ownerId: string): Promise<WhatsAppRecipient | null> {
  await requirePermission('whatsapp:send');
  const owner = await getOwner(ownerId);
  if (!owner) return null;
  const phoneRaw = owner.phone_whatsapp || owner.phone;
  return {
    ownerId: owner.id,
    ownerName: owner.full_name,
    patientId: null,
    patientName: null,
    phoneE164: pickOwnerWhatsAppPhone(owner.phone_whatsapp, owner.phone),
    phoneRaw,
  };
}

export async function listWhatsAppMessages(
  input: { page?: number; pageSize?: number; search?: string; ownerId?: string } = {}
): Promise<PaginatedResult<WhatsAppMessageListRow>> {
  await requirePermission('whatsapp:send');
  const parsed = whatsappListSchema.parse(input);
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_whatsapp_messages', {
    p_search: parsed.search?.trim() || null,
    p_owner_id: parsed.ownerId || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const messages = rows.map((row) => {
    const { total_count: _total, ...message } = row;
    void _total;
    return message;
  });

  return buildPaginatedResult(messages, Number(total), parsed.page, parsed.pageSize);
}

export async function logWhatsAppMessage(formData: FormData): Promise<ActionResult<WhatsAppLoggedMessage>> {
  try {
    const session = await requirePermission('whatsapp:send');
    const parsed = whatsappComposeSchema.safeParse({
      ownerId: formData.get('ownerId'),
      patientId: formData.get('patientId') || undefined,
      templateKey: formData.get('templateKey'),
      body: formData.get('body'),
      phone: formData.get('phone'),
      relatedType: formData.get('relatedType') || 'none',
      relatedId: formData.get('relatedId') || undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const phoneE164 = pickOwnerWhatsAppPhone(parsed.data.phone, null);
    if (!phoneE164) {
      return { success: false, error: 'El teléfono de WhatsApp es inválido' };
    }

    if (parsed.data.patientId) {
      const patient = await getPatient(parsed.data.patientId);
      if (!patient || patient.owner_id !== parsed.data.ownerId) {
        return { success: false, error: 'Paciente no encontrado' };
      }
    }

    await requireFeature(session.organizationId, FEATURES.WHATSAPP);
    await consumeMeteredFeature({
      organizationId: session.organizationId,
      featureKey: FEATURES.WHATSAPP_MONTHLY_MESSAGES,
    });

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('log_whatsapp_message', {
      p_owner_id: parsed.data.ownerId,
      p_body: parsed.data.body,
      p_phone_e164: phoneE164,
      p_template_key: parsed.data.templateKey,
      p_patient_id: parsed.data.patientId ?? null,
      p_related_type: parsed.data.relatedType ?? 'none',
      p_related_id: parsed.data.relatedId ?? null,
      p_branch_id: session.branchId,
    });

    if (error) {
      return { success: false, error: rpcMessage(error) };
    }

    const payload = data as { id?: string; phone_e164?: string; body?: string } | null;
    if (!payload?.id) {
      return { success: false, error: 'No se pudo registrar el mensaje' };
    }

    revalidatePath('/whatsapp');
    return {
      success: true,
      data: {
        id: payload.id,
        phoneE164,
        body: parsed.data.body,
        url: buildWhatsAppUrl(phoneE164, parsed.data.body),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}
