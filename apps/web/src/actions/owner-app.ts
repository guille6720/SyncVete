'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ownerAppInstallUrl } from '@/lib/owner-app-navigation';
import { createServerClient } from '@/lib/supabase/server';
import { requirePermission, requirePortalSession } from '@/lib/permissions';
import { FEATURES, requireFeature } from '@/lib/entitlements';
import {
  ownerAppEnabled,
  ownerAppBrandSchema,
  ownerAppBookingSchema,
  ownerAppSlotSchema,
  parseOwnerAppBrand,
} from '@/lib/owner-app';
import {
  buildWhatsAppUrl,
  buildPortalActivatePath,
  pickOwnerWhatsAppPhone,
  parsePortalInviteCreated,
  type ActionResult,
} from '@sincvete/shared';
import { PermissionError } from '@/lib/permissions';
import { planRestrictionResult } from '@/lib/entitlements';
import { getOwner } from '@/actions/owners';
import { getOwnerPortalStatus } from '@/actions/portal';
import { ownerAppOrigin } from '@/lib/owner-app-email';
import {
  isOwnerAppConfigured as isBridgeConfigured,
  sendOwnerAppInvite as sendBridgeInvite,
  type OwnerAppInviteResult,
} from '@/actions/owner-app-bridge';
export type { OwnerAppInviteResult } from '@/actions/owner-app-bridge';
import { z } from 'zod';

function requireStaging() {
  if (!ownerAppEnabled())
    throw new Error('La app de propietarios no esta habilitada en este entorno');
}

export async function getOwnerAppBrand(organizationId: string) {
  if (!ownerAppEnabled()) return null;
  const db = await createServerClient();
  const { data, error } = await db.rpc('get_owner_app_brand', {
    p_organization_id: organizationId,
  });
  if (error || !data) return null;
  return parseOwnerAppBrand(data);
}

export async function getOwnerAppInviteBrand(token: string) {
  if (!ownerAppEnabled() || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const db = await createServerClient();
  const { data, error } = await db.rpc('get_owner_app_invite_brand', { p_token: token });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  const parsed = z
    .object({ organizationId: z.string().uuid(), brand: ownerAppBrandSchema })
    .safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function saveOwnerAppBrand(
  _previous: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  requireStaging();
  await requirePermission('org:manage');
  const brand = ownerAppBrandSchema.safeParse({
    appName: form.get('appName'),
    logoUrl: form.get('logoUrl') || '',
    primaryColor: form.get('primaryColor'),
    welcomeText: form.get('welcomeText') || '',
    enabled: form.get('enabled') === 'on',
  });
  if (!brand.success)
    return { success: false, error: 'Revisa el nombre, el color y la URL del logo' };
  const db = await createServerClient();
  const { error } = await db.rpc('save_owner_app_brand', { p_brand: brand.data });
  if (error) return { success: false, error: 'No se pudo guardar la configuracion' };
  revalidatePath('/portal', 'layout');
  revalidatePath('/configuracion');
  return { success: true };
}

export type OwnerAppSlot = { id: string; starts_at: string; ends_at: string; branch_name: string };
export type OwnerAppReminder = { id: string; message: string; created_at: string };
export type OwnerAppBooking = { id: string; starts_at: string; patient_name: string };

export async function getOwnerAppData(): Promise<{
  slots: OwnerAppSlot[];
  reminders: OwnerAppReminder[];
  bookings: OwnerAppBooking[];
}> {
  requireStaging();
  const session = await requirePortalSession();
  await requireFeature(session.organizationId, FEATURES.OWNER_PORTAL);
  const db = await createServerClient();
  const { data, error } = await db.rpc('get_owner_app_data');
  if (error) throw new Error('No se pudo cargar la agenda y los avisos');
  return data as unknown as {
    slots: OwnerAppSlot[];
    reminders: OwnerAppReminder[];
    bookings: OwnerAppBooking[];
  };
}

export async function cancelOwnerAppBooking(
  _previous: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  requireStaging();
  const session = await requirePortalSession();
  await requireFeature(session.organizationId, FEATURES.OWNER_PORTAL);
  const id = z.string().uuid().safeParse(form.get('appointmentId'));
  if (!id.success) return { success: false, error: 'Turno invalido' };
  const db = await createServerClient();
  const { error } = await db.rpc('cancel_owner_app_booking', { p_appointment_id: id.data });
  if (error) return { success: false, error: 'No se pudo cancelar el turno' };
  revalidatePath('/portal', 'layout');
  revalidatePath('/agenda');
  return { success: true };
}

export async function bookOwnerAppSlot(
  _previous: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  requireStaging();
  const session = await requirePortalSession();
  await requireFeature(session.organizationId, FEATURES.OWNER_PORTAL);
  const input = ownerAppBookingSchema.safeParse({
    slotId: form.get('slotId'),
    patientId: form.get('patientId'),
  });
  if (!input.success) return { success: false, error: 'Selecciona una mascota y un horario' };
  const db = await createServerClient();
  const { error } = await db.rpc('book_owner_app_slot', {
    p_slot_id: input.data.slotId,
    p_patient_id: input.data.patientId,
  });
  if (error)
    return {
      success: false,
      error: 'El horario ya no esta disponible. Actualiza la agenda e intenta nuevamente.',
    };
  revalidatePath('/portal', 'layout');
  revalidatePath('/agenda');
  return { success: true };
}

export async function publishOwnerAppSlot(
  _previous: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  requireStaging();
  await requirePermission('appointments:write');
  const input = ownerAppSlotSchema.safeParse({
    branchId: form.get('branchId'),
    startsAt: form.get('startsAt'),
  });
  if (!input.success) return { success: false, error: 'Revisa la sucursal y el horario' };
  const db = await createServerClient();
  const { error } = await db.rpc('publish_owner_app_slot', {
    p_branch_id: input.data.branchId,
    p_starts_at: input.data.startsAt,
  });
  if (error)
    return {
      success: false,
      error: 'No se pudo publicar el horario; revisa si hay otro turno en ese intervalo',
    };
  revalidatePath('/portal', 'layout');
  return { success: true };
}

export async function isOwnerAppConfigured(): Promise<boolean> {
  return ownerAppEnabled() || isBridgeConfigured();
}

export async function sendOwnerAppInvite(
  ownerId: string
): Promise<ActionResult<OwnerAppInviteResult>> {
  if (!ownerAppEnabled()) return sendBridgeInvite(ownerId);
  try {
    const session = await requirePermission('patients:write');
    await requireFeature(session.organizationId, FEATURES.OWNER_PORTAL);
    const brand = await getOwnerAppBrand(session.organizationId);
    if (!brand?.enabled)
      return { success: false, error: 'Habilita la app en la configuracion de la clinica.' };
    const owner = await getOwner(ownerId);
    if (!owner) return { success: false, error: 'Propietario no encontrado' };
    if (!owner.is_active)
      return { success: false, error: 'Activa al propietario en su ficha antes de enviar la app.' };
    const phone = pickOwnerWhatsAppPhone(owner.phone_whatsapp, owner.phone);
    if (!phone) return { success: false, error: 'Carga un telefono de WhatsApp valido.' };
    const origin = ownerAppOrigin();
    const status = await getOwnerPortalStatus(ownerId);
    if (status?.status === 'active') {
      const text = `Hola ${owner.full_name}, instalá ${brand.appName} desde ${origin}${ownerAppInstallUrl(session.organizationId)}\n\nIngresá con tu cuenta para ver tus mascotas, vacunas, tratamientos y turnos.\n\nHecho por OpusOrg`;
      return {
        success: true,
        data: { whatsappUrl: buildWhatsAppUrl(phone, text), whatsappText: text },
      };
    }
    const db = await createServerClient();
    const { data, error } = await db.rpc('create_owner_portal_invite', { p_owner_id: ownerId });
    if (error)
      return {
        success: false,
        error: 'No se pudo crear la invitacion. Revisa el email del propietario.',
      };
    const invite = parsePortalInviteCreated(data);
    if (!invite) return { success: false, error: 'No se pudo crear la invitacion' };
    const text = `Hola ${owner.full_name}, activa tu acceso a ${brand.appName} e instala la app desde este enlace privado: ${origin}${buildPortalActivatePath(invite.token)}\n\nHecho por OpusOrg`;
    revalidatePath(`/propietarios/${ownerId}`);
    return {
      success: true,
      data: {
        expiresAt: invite.expiresAt,
        whatsappUrl: buildWhatsAppUrl(phone, text),
        whatsappText: text,
      },
    };
  } catch (error) {
    const planError = planRestrictionResult<OwnerAppInviteResult>(error);
    if (planError) return planError;
    if (error instanceof PermissionError) return { success: false, error: error.message };
    return { success: false, error: 'No se pudo generar el enlace de la app.' };
  }
}

export async function signOutOwnerApp(): Promise<void> {
  const session = await requirePortalSession();
  const db = await createServerClient();
  await db.auth.signOut();
  redirect(ownerAppInstallUrl(session.organizationId));
}
