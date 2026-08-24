'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  portalActivateSchema,
  parseOwnerPortalHome,
  parseOwnerPortalPatient,
  parseOwnerPortalStatus,
  parsePortalInviteCreated,
  parsePortalInvitePreview,
  parsePortalWaitingRoomRows,
  parseOwnerPortalAlerts,
  type ActionResult,
  type OwnerPortalAlert,
  type OwnerPortalHome,
  type OwnerPortalPatient,
  type OwnerPortalStatus,
  type PortalInviteCreated,
  type PortalInvitePreview,
  type PortalWaitingRoomRow,
} from '@sincvete/shared';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePortalSession } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult, requireFeature, canUseFeature } from '@/lib/entitlements';

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
  if (message.includes('email')) return message;
  if (message.includes('permisos')) return message;
  if (message.includes('Invitación')) return message;
  if (message.includes('portal')) return message;
  if (message.includes('clínica') || message.includes('clinica')) return message;
  if (message.includes('cuenta')) return message;
  if (message.includes('Propietario')) return message;
  return 'Ocurrió un error inesperado';
}

export async function previewPortalInvite(token: string): Promise<PortalInvitePreview | null> {
  if (!token.trim()) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('preview_owner_portal_invite', {
    p_token: token.trim(),
  });
  if (error) return null;
  return parsePortalInvitePreview(data);
}

export async function getOwnerPortalStatus(ownerId: string): Promise<OwnerPortalStatus | null> {
  await requirePermission('patients:read');
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('get_owner_portal_status', {
    p_owner_id: ownerId,
  });
  if (error) return null;
  return parseOwnerPortalStatus(data);
}

export async function inviteOwnerToPortal(ownerId: string): Promise<ActionResult<PortalInviteCreated>> {
  try {
    const session = await requirePermission('patients:write');
    await requireFeature(session.organizationId, FEATURES.OWNER_PORTAL);
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('create_owner_portal_invite', {
      p_owner_id: ownerId,
    });
    if (error) {
      return { success: false, error: rpcMessage(error) };
    }
    const invite = parsePortalInviteCreated(data);
    if (!invite) {
      return { success: false, error: 'No se pudo crear la invitación' };
    }
    revalidatePath(`/propietarios/${ownerId}`);
    return { success: true, data: invite };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeOwnerPortalAccess(ownerId: string): Promise<ActionResult> {
  try {
    await requirePermission('patients:write');
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('revoke_owner_portal_access', {
      p_owner_id: ownerId,
    });
    if (error) {
      return { success: false, error: rpcMessage(error) };
    }
    revalidatePath(`/propietarios/${ownerId}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function getOwnerPortalHome(): Promise<OwnerPortalHome | null> {
  const session = await requirePortalSession();
  const allowed = await canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.OWNER_PORTAL,
  });
  if (!allowed) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('get_owner_portal_home');
  if (error) return null;
  return parseOwnerPortalHome(data);
}

export async function getOwnerPortalPatient(patientId: string): Promise<OwnerPortalPatient | null> {
  const session = await requirePortalSession();
  const allowed = await canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.OWNER_PORTAL,
  });
  if (!allowed) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('get_owner_portal_patient', {
    p_patient_id: patientId,
  });
  if (error) return null;
  return parseOwnerPortalPatient(data);
}

export async function getOwnerPortalWaitingRoom(date?: string): Promise<PortalWaitingRoomRow[]> {
  const session = await requirePortalSession();
  const [portalAllowed, waitingRoomAllowed] = await Promise.all([
    canUseFeature({
      organizationId: session.organizationId,
      featureKey: FEATURES.OWNER_PORTAL,
    }),
    canUseFeature({
      organizationId: session.organizationId,
      featureKey: FEATURES.WAITING_ROOM,
    }),
  ]);
  if (!portalAllowed || !waitingRoomAllowed) return [];

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_owner_portal_waiting_room', {
    p_date: date ?? null,
  });
  if (error) {
    console.error('[portal] list_owner_portal_waiting_room', error.message);
    return [];
  }
  return parsePortalWaitingRoomRows(data);
}

export async function listOwnerPortalAlerts(
  unreadOnly = true
): Promise<OwnerPortalAlert[]> {
  const session = await requirePortalSession();
  const portalAllowed = await canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.OWNER_PORTAL,
  });
  if (!portalAllowed) return [];

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_owner_portal_alerts', {
    p_unread_only: unreadOnly,
    p_limit: 20,
  });
  if (error) {
    console.error('[portal] list_owner_portal_alerts', error.message);
    return [];
  }
  return parseOwnerPortalAlerts(data);
}

export async function markOwnerPortalAlertsRead(
  ids?: string[]
): Promise<ActionResult<{ count: number }>> {
  try {
    await requirePortalSession();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('mark_owner_portal_alerts_read', {
      p_ids: ids && ids.length > 0 ? ids : null,
    });
    if (error) {
      return { success: false, error: rpcMessage(error) };
    }
    return { success: true, data: { count: Number(data ?? 0) } };
  } catch (error) {
    return actionError<{ count: number }>(error);
  }
}

export async function acceptPortalInviteForm(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const token = String(formData.get('token') ?? '').trim();
  if (!token) {
    return { success: false, error: 'Invitación inválida o vencida' };
  }
  return acceptPortalInvite(token);
}

export async function acceptPortalInvite(token: string): Promise<ActionResult> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Sesión no válida' };
    }

    const { error } = await supabase.rpc('accept_owner_portal_invite', {
      p_token: token.trim(),
      p_full_name: user.user_metadata?.full_name ?? null,
    });
    if (error) {
      return { success: false, error: rpcMessage(error) };
    }

    redirect('/portal');
  } catch (error) {
    return actionError(error);
  }
}

export async function activatePortalAccount(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = portalActivateSchema.safeParse({
    token: formData.get('token'),
    fullName: formData.get('fullName'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'Datos inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const preview = await previewPortalInvite(parsed.data.token);
  if (!preview) {
    return { success: false, error: 'Invitación inválida o vencida' };
  }

  const session = await getSessionContext();
  if (session?.kind === 'staff') {
    return { success: false, error: 'Esta cuenta pertenece al equipo de una clínica' };
  }

  const supabase = await createServerClient();
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();

  try {
    if (!existingUser) {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: preview.email,
        password: parsed.data.password,
      });

      if (authError || !authData.user) {
        return {
          success: false,
          error: authError?.message?.includes('already')
            ? 'Ese email ya tiene una cuenta. Ingresá y volvé a abrir el enlace.'
            : (authError?.message ?? 'No se pudo crear la cuenta'),
        };
      }

      const { error: acceptError } = await supabase.rpc('accept_owner_portal_invite', {
        p_token: parsed.data.token,
        p_full_name: parsed.data.fullName,
      });

      if (acceptError) {
        const service = await createServiceClient();
        await service.auth.admin.deleteUser(authData.user.id);
        return { success: false, error: rpcMessage(acceptError) };
      }
    } else {
      const { error: acceptError } = await supabase.rpc('accept_owner_portal_invite', {
        p_token: parsed.data.token,
        p_full_name: parsed.data.fullName,
      });
      if (acceptError) {
        return { success: false, error: rpcMessage(acceptError) };
      }
    }

    redirect('/portal');
  } catch (error) {
    return actionError(error);
  }
}
