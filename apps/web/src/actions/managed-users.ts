'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  ACTIVITY_MODULES,
  INVITABLE_ROLES,
  PERMISSIONS,
  ROLES,
  activityModuleForEntity,
  buildPaginatedResult,
  describeActivity,
  managedUserErrorMessage,
  summarizeUserAgent,
  type AccountStatus,
  type ActionResult,
  type ManagedInvitationRow,
  type ManagedUserAccess,
  type ManagedUserRow,
  type ManagedUsersOverview,
  type PaginatedResult,
  type Role,
  type UserActivityRow,
} from '@sincvete/shared';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission } from '@/lib/permissions';
import { getAppOrigin } from '@/lib/app-origin';
import { readServerEnv } from '@/lib/server-env';
import {
  FEATURES,
  assertWithinLimit,
  getSeatUsageMeters,
  planRestrictionResult,
} from '@/lib/entitlements';

const USERS_PATH = '/usuarios';

/** Commercial plan seats (users.max / professionals.max) still apply on top of the managed-user limit. */
async function assertPlanSeats(
  organizationId: string,
  opts: { newUser: boolean; newVeterinarian: boolean }
) {
  if (!opts.newUser && !opts.newVeterinarian) return;
  const meters = await getSeatUsageMeters(organizationId);
  if (opts.newUser) {
    await assertWithinLimit({
      organizationId,
      featureKey: FEATURES.USERS_MAX,
      currentCount: meters.find((m) => m.featureKey === FEATURES.USERS_MAX)?.used ?? 0,
    });
  }
  if (opts.newVeterinarian) {
    await assertWithinLimit({
      organizationId,
      featureKey: FEATURES.PROFESSIONALS_MAX,
      currentCount: meters.find((m) => m.featureKey === FEATURES.PROFESSIONALS_MAX)?.used ?? 0,
    });
  }
}

function fail<T = void>(error: unknown, fallback: string): ActionResult<T> {
  const planError = planRestrictionResult<T>(error);
  if (planError) return planError;
  if (error instanceof PermissionError) {
    return { success: false, error: error.message };
  }
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  const mapped = managedUserErrorMessage(raw);
  if (!mapped) console.error('[managed-users]', raw);
  return { success: false, error: mapped ?? fallback };
}

function revalidateUsers(userId?: string) {
  revalidatePath(USERS_PATH);
  revalidatePath(`${USERS_PATH}/actividad`);
  if (userId) revalidatePath(`${USERS_PATH}/${userId}`);
}

const uuid = z.string().uuid();
const permissionKey = z.enum(PERMISSIONS);
const invitableRole = z.enum(INVITABLE_ROLES as [Role, ...Role[]]);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido').max(254),
  fullName: z.string().trim().min(2, 'Ingresá el nombre').max(200),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  branchId: uuid,
  role: invitableRole,
  deniedPermissions: z.array(permissionKey).max(PERMISSIONS.length).default([]),
});

const updateSchema = z.object({
  userId: uuid,
  fullName: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  role: z.enum(ROLES),
  branchId: uuid,
});

const statusSchema = z.object({
  userId: uuid,
  status: z.enum(ACCOUNT_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

const activitySchema = z.object({
  userId: uuid.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  action: z.string().regex(/^[a-z_.]+$/).max(60).optional(),
  module: z.string().max(40).optional(),
  branchId: uuid.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

type RpcUserRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  branch_id: string | null;
  branch_name: string | null;
  branch_count: number;
  account_status: string;
  is_central_admin: boolean;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
  denied_permissions: string[] | null;
  status_reason: string | null;
  status_changed_at: string | null;
  created_at: string;
};

function mapUser(row: RpcUserRow): ManagedUserRow {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    branchId: row.branch_id,
    branchName: row.branch_name,
    branchCount: row.branch_count ?? 0,
    status: (ACCOUNT_STATUSES as readonly string[]).includes(row.account_status)
      ? (row.account_status as AccountStatus)
      : 'disabled',
    isCentralAdmin: row.is_central_admin,
    lastSignInAt: row.last_sign_in_at,
    lastActivityAt: row.last_activity_at,
    deniedPermissions: row.denied_permissions ?? [],
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
  };
}

function toOverview(raw: unknown): ManagedUsersOverview {
  const o = (raw ?? {}) as Record<string, number | null | undefined>;
  return {
    limit: o.limit === null ? null : Number(o.limit ?? 0),
    seatsUsed: Number(o.seats_used ?? 0),
    totalUsers: Number(o.total_users ?? 0),
    centralAdmins: Number(o.central_admins ?? 0),
    activeManaged: Number(o.active_managed ?? 0),
    suspended: Number(o.suspended ?? 0),
    disabled: Number(o.disabled ?? 0),
    pendingInvitations: Number(o.pending_invitations ?? 0),
    activityToday: Number(o.activity_today ?? 0),
  };
}

export async function getManagedUsersPageData(): Promise<{
  overview: ManagedUsersOverview;
  users: ManagedUserRow[];
  invitations: ManagedInvitationRow[];
  branches: Array<{ id: string; name: string }>;
  currentUserId: string;
  currentUserIsCentralAdmin: boolean;
}> {
  const session = await requirePermission('users:manage');
  const supabase = await createServerClient();

  const [overviewRes, usersRes, invitationsRes, branchesRes] = await Promise.all([
    supabase.rpc('get_managed_users_overview'),
    supabase.rpc('list_managed_users', {}),
    supabase.rpc('list_managed_invitations'),
    supabase
      .from('branches')
      .select('id, name')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name'),
  ]);

  if (overviewRes.error) throw overviewRes.error;
  if (usersRes.error) throw usersRes.error;
  if (invitationsRes.error) throw invitationsRes.error;

  const users = (usersRes.data ?? []).map((row) => mapUser(row as RpcUserRow));

  return {
    overview: toOverview(overviewRes.data),
    users,
    invitations: (invitationsRes.data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      role: row.role as Role,
      branchId: row.branch_id,
      branchName: row.branch_name,
      status: row.status === 'expired' ? 'expired' : 'pending',
      expiresAt: row.expires_at,
      lastSentAt: row.last_sent_at,
      sendCount: row.send_count,
      deniedPermissions: row.denied_permissions ?? [],
      createdAt: row.created_at,
    })),
    branches: branchesRes.data ?? [],
    currentUserId: session.userId,
    currentUserIsCentralAdmin: session.role === 'owner',
  };
}

export async function getManagedUserDetail(userId: string): Promise<{
  user: ManagedUserRow;
  access: ManagedUserAccess;
  branches: Array<{ id: string; name: string }>;
  isSelf: boolean;
  currentUserIsCentralAdmin: boolean;
} | null> {
  const session = await requirePermission('users:manage');
  if (!uuid.safeParse(userId).success) return null;
  const supabase = await createServerClient();

  const [userRes, accessRes, branchesRes] = await Promise.all([
    supabase.rpc('list_managed_users', { p_user_id: userId }),
    supabase.rpc('get_managed_user_access', { p_user_id: userId }),
    supabase
      .from('branches')
      .select('id, name')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name'),
  ]);

  if (userRes.error) throw userRes.error;
  const row = userRes.data?.[0];
  if (!row) return null;

  const accessRaw = (accessRes.error ? null : accessRes.data) as {
    last_sign_in_at?: string | null;
    sessions?: Array<{ created_at: string; last_active_at: string; user_agent: string | null }>;
  } | null;

  return {
    user: mapUser(row as RpcUserRow),
    access: {
      lastSignInAt: accessRaw?.last_sign_in_at ?? null,
      sessions: (accessRaw?.sessions ?? []).map((s) => ({
        createdAt: s.created_at,
        lastActiveAt: s.last_active_at,
        device: summarizeUserAgent(s.user_agent),
      })),
    },
    branches: branchesRes.data ?? [],
    isSelf: userId === session.userId,
    currentUserIsCentralAdmin: session.role === 'owner',
  };
}

export async function listUserActivity(
  input: z.input<typeof activitySchema>
): Promise<PaginatedResult<UserActivityRow>> {
  await requirePermission(['users:manage', 'audit:read']);
  const parsed = activitySchema.parse(input);
  const supabase = await createServerClient();

  const entityTypes = parsed.module
    ? ACTIVITY_MODULES.find((m) => m.id === parsed.module)?.entityTypes ?? null
    : null;

  // Dates are clinic-local days (America/Argentina/Buenos_Aires, UTC-3).
  const from = parsed.from ? `${parsed.from}T00:00:00-03:00` : null;
  const to = parsed.to
    ? new Date(new Date(`${parsed.to}T00:00:00-03:00`).getTime() + 86_400_000).toISOString()
    : null;

  const { data, error } = await supabase.rpc('search_user_activity', {
    p_user_id: parsed.userId ?? null,
    p_from: from,
    p_to: to,
    p_action: parsed.action ?? null,
    p_entity_types: entityTypes,
    p_branch_id: parsed.branchId ?? null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);

  return buildPaginatedResult(
    rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      userId: row.user_id,
      userName: row.user_name,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      branchName: row.branch_name,
      module: activityModuleForEntity(row.entity_type),
      description: describeActivity({
        action: row.action,
        entityType: row.entity_type,
        statusFrom: row.status_from,
        statusTo: row.status_to,
      }),
      details: (row.details as Record<string, unknown> | null) ?? null,
    })),
    total,
    parsed.page,
    parsed.pageSize
  );
}

/**
 * Sends the invitation email through Supabase Auth. New emails get an invite link; emails that
 * already have an auth account (e.g. left another clinic) get a magic link. Both land on
 * /actualizar-contrasena and then /home, which binds the pending invitation.
 */
async function sendInvitationEmail(email: string, fullName: string | null): Promise<boolean> {
  const origin = getAppOrigin(await headers());
  const redirectTo = `${origin}/actualizar-contrasena`;

  try {
    const service = await createServiceClient();
    const { error } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: fullName ? { full_name: fullName } : undefined,
    });
    if (!error) return true;

    const url = readServerEnv('NEXT_PUBLIC_SUPABASE_URL');
    const anonKey = readServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (!url || !anonKey) return false;
    const { createClient } = await import('@supabase/supabase-js');
    const mailer = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' },
    });
    const { error: otpError } = await mailer.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
    return !otpError;
  } catch (error) {
    console.error('[managed-users] invitation email', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function inviteManagedUser(
  input: z.input<typeof inviteSchema>
): Promise<ActionResult<{ invitationId: string; emailSent: boolean }>> {
  try {
    const session = await requirePermission('users:manage');
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Revisá los datos del usuario',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    await assertPlanSeats(session.organizationId, {
      newUser: true,
      newVeterinarian: parsed.data.role === 'veterinarian',
    });

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('create_managed_invitation', {
      p_email: parsed.data.email,
      p_full_name: parsed.data.fullName,
      p_phone: parsed.data.phone || null,
      p_branch_id: parsed.data.branchId,
      p_role: parsed.data.role,
      p_denied_permissions: parsed.data.deniedPermissions,
    });
    if (error) return fail(error, 'No se pudo crear la invitación');

    const emailSent = await sendInvitationEmail(parsed.data.email, parsed.data.fullName);
    revalidateUsers();
    return { success: true, data: { invitationId: String(data), emailSent } };
  } catch (error) {
    return fail(error, 'No se pudo crear la invitación');
  }
}

export async function resendManagedInvitation(
  invitationId: string
): Promise<ActionResult<{ emailSent: boolean }>> {
  try {
    await requirePermission('users:manage');
    if (!uuid.safeParse(invitationId).success) return { success: false, error: 'Invitación inválida' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('resend_managed_invitation', {
      p_invitation_id: invitationId,
    });
    if (error) return fail(error, 'No se pudo reenviar la invitación');

    const invite = (data ?? {}) as { email?: string; full_name?: string | null };
    const emailSent = invite.email ? await sendInvitationEmail(invite.email, invite.full_name ?? null) : false;
    revalidateUsers();
    return { success: true, data: { emailSent } };
  } catch (error) {
    return fail(error, 'No se pudo reenviar la invitación');
  }
}

/**
 * Builds an Auth activation link for a pending invitation so the admin can share it
 * (WhatsApp/email) when the built-in Supabase mailer does not deliver.
 */
export async function getManagedInvitationActivationLink(
  invitationId: string
): Promise<ActionResult<{ link: string; email: string }>> {
  try {
    await requirePermission('users:manage');
    if (!uuid.safeParse(invitationId).success) return { success: false, error: 'Invitación inválida' };

    const supabase = await createServerClient();
    const { data: inv, error } = await supabase
      .from('organization_invitations')
      .select('id, email, full_name, status')
      .eq('id', invitationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return fail(error, 'No se pudo leer la invitación');
    if (!inv || inv.status !== 'pending') {
      return { success: false, error: 'La invitación no está pendiente' };
    }

    const origin = getAppOrigin(await headers());
    const redirectTo = `${origin}/actualizar-contrasena`;
    const service = await createServiceClient();
    const meta = inv.full_name ? { full_name: inv.full_name } : undefined;

    // Prefer an app-hosted link with token_hash so activation does not depend on
    // Supabase Site URL (often still localhost on staging).
    let link: string | null = null;
    let lastError: string | null = null;

    const tryBuild = async (
      generate: () => ReturnType<typeof service.auth.admin.generateLink>
    ) => {
      const attempt = await generate();
      if (attempt.error) {
        lastError = attempt.error.message;
        return null;
      }
      const props = attempt.data?.properties;
      const tokenHash = props?.hashed_token;
      const verificationType = props?.verification_type;
      if (tokenHash && verificationType) {
        const params = new URLSearchParams({
          token_hash: tokenHash,
          type: verificationType,
        });
        return `${origin}/actualizar-contrasena?${params.toString()}`;
      }
      if (props?.action_link && !/[?&]redirect_to=https?%3A%2F%2Flocalhost/i.test(props.action_link) && !props.action_link.includes('://localhost')) {
        return props.action_link;
      }
      lastError = 'Auth no devolvió un token de activación';
      return null;
    };

    link =
      (await tryBuild(() =>
        service.auth.admin.generateLink({
          type: 'invite',
          email: inv.email,
          options: { redirectTo, data: meta },
        })
      )) ??
      (await tryBuild(() =>
        service.auth.admin.generateLink({
          type: 'magiclink',
          email: inv.email,
          options: { redirectTo, data: meta },
        })
      )) ??
      (await tryBuild(() =>
        service.auth.admin.generateLink({
          type: 'recovery',
          email: inv.email,
          options: { redirectTo },
        })
      ));

    if (!link) {
      console.error('[managed-users] activation link', lastError);
      return { success: false, error: 'No se pudo generar el enlace de activación' };
    }

    return { success: true, data: { link, email: inv.email } };
  } catch (error) {
    return fail(error, 'No se pudo generar el enlace de activación');
  }
}

export async function revokeManagedInvitation(invitationId: string): Promise<ActionResult> {
  try {
    await requirePermission('users:manage');
    if (!uuid.safeParse(invitationId).success) return { success: false, error: 'Invitación inválida' };
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('revoke_managed_invitation', { p_invitation_id: invitationId });
    if (error) return fail(error, 'No se pudo revocar la invitación');
    revalidateUsers();
    return { success: true };
  } catch (error) {
    return fail(error, 'No se pudo revocar la invitación');
  }
}

export async function updateManagedUser(
  input: z.input<typeof updateSchema>
): Promise<ActionResult> {
  try {
    const session = await requirePermission('users:manage');
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Revisá los datos del usuario',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }
    const supabase = await createServerClient();
    if (parsed.data.role === 'veterinarian') {
      const { data: current } = await supabase.rpc('list_managed_users', {
        p_user_id: parsed.data.userId,
      });
      const row = current?.[0];
      if (row && !(row.role === 'veterinarian' && row.account_status === 'active')) {
        await assertPlanSeats(session.organizationId, {
          newUser: false,
          newVeterinarian: row.account_status === 'active',
        });
      }
    }
    const { error } = await supabase.rpc('update_managed_user', {
      p_user_id: parsed.data.userId,
      p_full_name: parsed.data.fullName,
      p_phone: parsed.data.phone || null,
      p_role: parsed.data.role,
      p_branch_id: parsed.data.branchId,
    });
    if (error) return fail(error, 'No se pudo actualizar el usuario');
    revalidateUsers(parsed.data.userId);
    return { success: true };
  } catch (error) {
    return fail(error, 'No se pudo actualizar el usuario');
  }
}

export async function setManagedUserStatus(
  input: z.input<typeof statusSchema>
): Promise<ActionResult> {
  try {
    const session = await requirePermission('users:manage');
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };
    const supabase = await createServerClient();
    if (parsed.data.status === 'active') {
      const { data: current } = await supabase.rpc('list_managed_users', {
        p_user_id: parsed.data.userId,
      });
      const row = current?.[0];
      if (row && row.account_status !== 'active') {
        await assertPlanSeats(session.organizationId, {
          newUser: true,
          newVeterinarian: row.role === 'veterinarian',
        });
      }
    }
    const { error } = await supabase.rpc('set_managed_user_status', {
      p_user_id: parsed.data.userId,
      p_status: parsed.data.status,
      p_reason: parsed.data.reason ?? null,
    });
    if (error) return fail(error, 'No se pudo cambiar el estado');
    revalidateUsers(parsed.data.userId);
    return { success: true };
  } catch (error) {
    return fail(error, 'No se pudo cambiar el estado');
  }
}

export async function revokeManagedUserSessions(
  userId: string
): Promise<ActionResult<{ sessions: number }>> {
  try {
    await requirePermission('users:manage');
    if (!uuid.safeParse(userId).success) return { success: false, error: 'Usuario inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('revoke_managed_user_sessions', { p_user_id: userId });
    if (error) return fail(error, 'No se pudieron cerrar las sesiones');
    revalidateUsers(userId);
    return { success: true, data: { sessions: Number(data ?? 0) } };
  } catch (error) {
    return fail(error, 'No se pudieron cerrar las sesiones');
  }
}

export async function setManagedUserPermissions(
  userId: string,
  deniedPermissions: string[]
): Promise<ActionResult> {
  try {
    await requirePermission('users:manage');
    const parsed = z
      .object({ userId: uuid, denied: z.array(permissionKey).max(PERMISSIONS.length) })
      .safeParse({ userId, denied: deniedPermissions });
    if (!parsed.success) return { success: false, error: 'Permisos inválidos' };
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('set_user_permission_restrictions', {
      p_user_id: parsed.data.userId,
      p_denied_permissions: parsed.data.denied,
    });
    if (error) return fail(error, 'No se pudieron guardar los permisos');
    revalidateUsers(parsed.data.userId);
    return { success: true };
  } catch (error) {
    return fail(error, 'No se pudieron guardar los permisos');
  }
}
