'use server';

import { revalidatePath } from 'next/cache';
import { buildWhatsAppUrl, pickOwnerWhatsAppPhone, type ActionResult } from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission } from '@/lib/permissions';
import { getOwner } from '@/actions/owners';
import { canSendWhatsApp } from '@/actions/whatsapp';
import { consumeMeteredFeature, FEATURES, planRestrictionResult } from '@/lib/entitlements';

/**
 * "Enviar app" — issues a private invitation to the owner app (app-<clinic>)
 * through its server-to-server endpoint and prepares the WhatsApp message.
 *
 * Env (server-only): OWNER_APP_URL, OWNER_APP_BRIDGE_SECRET.
 */

export interface OwnerAppInviteResult {
  expiresAt: string;
  whatsappUrl: string;
  whatsappText: string;
}

interface BridgeResponse {
  url: string;
  expiresAt: string;
  whatsappText: string;
}

const BRIDGE_ERRORS: Record<string, string> = {
  CLINIC_NOT_LINKED: 'La clínica todavía no está vinculada con la app de propietarios.',
  CLINIC_INACTIVE: 'La app de propietarios de esta clínica está desactivada.',
  unauthorized: 'La conexión con la app de propietarios no está bien configurada.',
};

function bridgeConfig(): { url: string; secret: string } | null {
  const url = process.env.OWNER_APP_URL?.replace(/\/$/, '');
  const secret = process.env.OWNER_APP_BRIDGE_SECRET;
  return url && secret ? { url, secret } : null;
}

export async function isOwnerAppConfigured(): Promise<boolean> {
  return bridgeConfig() !== null;
}

export async function sendOwnerAppInvite(ownerId: string): Promise<ActionResult<OwnerAppInviteResult>> {
  try {
    const session = await requirePermission('patients:write');
    const config = bridgeConfig();
    if (!config) {
      return { success: false, error: 'La app de propietarios no está configurada en este entorno.' };
    }

    const owner = await getOwner(ownerId);
    if (!owner) return { success: false, error: 'Propietario no encontrado' };

    const phoneE164 = pickOwnerWhatsAppPhone(owner.phone_whatsapp, owner.phone);
    if (!phoneE164) {
      return { success: false, error: 'Cargá un teléfono o WhatsApp válido en la ficha del propietario.' };
    }

    const supabase = await createServerClient();
    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select('id, name, species, breed, sex, birth_date')
      .eq('owner_id', owner.id)
      .eq('is_deceased', false)
      .is('deleted_at', null)
      .order('name');
    if (patientsError) throw patientsError;

    const res = await fetch(`${config.url}/api/integrations/syncvete/invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: session.organizationId,
        owner: {
          id: owner.id,
          fullName: owner.full_name,
          email: owner.email,
          phone: owner.phone_whatsapp || owner.phone,
        },
        patients: (patients ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          species: p.species,
          breed: p.breed,
          sex: p.sex,
          birthDate: p.birth_date,
        })),
        sendEmail: false,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const payload = (await res.json().catch(() => ({}))) as Partial<BridgeResponse> & { error?: string };
    if (!res.ok || !payload.url || !payload.whatsappText) {
      console.error('[owner-app] invite failed', res.status, payload.error);
      return {
        success: false,
        error: BRIDGE_ERRORS[payload.error ?? ''] ?? 'No se pudo generar el enlace de la app. Probá de nuevo.',
      };
    }

    if (await canSendWhatsApp()) {
      // The invitation already exists at this point: logging must never block sending it.
      try {
        await consumeMeteredFeature({
          organizationId: session.organizationId,
          featureKey: FEATURES.WHATSAPP_MONTHLY_MESSAGES,
        });
        const { error: logError } = await supabase.rpc('log_whatsapp_message', {
          p_owner_id: owner.id,
          p_body: payload.whatsappText,
          p_phone_e164: phoneE164,
          p_template_key: 'portal_invite',
          p_patient_id: null,
          p_related_type: 'portal',
          p_related_id: null,
          p_branch_id: session.branchId,
        });
        if (logError) console.error('[owner-app] whatsapp log failed', logError.message);
        revalidatePath('/whatsapp');
      } catch (logFailure) {
        console.error('[owner-app] whatsapp log skipped', logFailure);
      }
    }

    return {
      success: true,
      data: {
        expiresAt: payload.expiresAt ?? '',
        whatsappUrl: buildWhatsAppUrl(phoneE164, payload.whatsappText),
        whatsappText: payload.whatsappText,
      },
    };
  } catch (error) {
    const planError = planRestrictionResult<OwnerAppInviteResult>(error);
    if (planError) return planError;
    if (error instanceof PermissionError) return { success: false, error: error.message };
    console.error(error);
    return { success: false, error: 'Ocurrió un error inesperado' };
  }
}
