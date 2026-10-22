'use server';

import { revalidatePath } from 'next/cache';
import { cache } from 'react';
import {
  branchListSchema,
  branchSchema,
  buildPaginatedResult,
  inviteMemberSchema,
  mergeOrganizationSettings,
  organizationSettingsSchema,
  normalizeWaitingRoomRooms,
  parseOrganizationSettings,
  setActiveBranchSchema,
  teamListSchema,
  updateMemberSchema,
  type ActionResult,
  type Branch,
  type Organization,
  type OrganizationInvitation,
  type OrganizationSettings,
  type PaginatedResult,
  type TeamMemberRow,
  APP_TIMEZONE,
} from '@sincvete/shared';
import type { Role } from '@sincvete/shared';
import type { Json } from '@sincvete/db';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requireSession } from '@/lib/permissions';
import { ORGANIZATION_COLUMNS } from '@/lib/db-columns';
import {
  FEATURES,
  assertWithinLimit,
  getSeatUsageMeters,
  planRestrictionResult,
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

async function assertVeterinarianSeatAvailable(organizationId: string) {
  const seats = await getSeatUsageMeters(organizationId);
  const meter = seats.find((item) => item.featureKey === FEATURES.PROFESSIONALS_MAX);
  await assertWithinLimit({
    organizationId,
    featureKey: FEATURES.PROFESSIONALS_MAX,
    currentCount: meter?.used ?? 0,
  });
}

/** Request-scoped clinic metadata (non-PHI). Dedupes layout + forms + dashboard. */
const loadOrganization = cache(async (): Promise<Organization | null> => {
  const session = await requireSession();
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('organizations')
    .select(ORGANIZATION_COLUMNS)
    .eq('id', session.organizationId)
    .is('deleted_at', null)
    .single();

  if (error) return null;
  return data as Organization;
});

export async function getOrganization(): Promise<Organization | null> {
  return loadOrganization();
}

export async function getOrganizationSettingsForm(): Promise<
  ActionResult<{
    organization: Organization;
    settings: OrganizationSettings;
  }>
> {
  try {
    await requirePermission('org:manage');
    const organization = await getOrganization();
    if (!organization) {
      return { success: false, error: 'Clínica no encontrada' };
    }

    const settings = parseOrganizationSettings(organization.settings);
    return {
      success: true,
      data: {
        organization,
        settings: {
          timezone: settings.timezone ?? APP_TIMEZONE,
          currency: settings.currency ?? 'ARS',
          phone: settings.phone ?? '',
          email: settings.email ?? '',
          taxId: settings.taxId ?? '',
          waitingRoomRooms: settings.waitingRoomRooms ?? [],
          waitingRoomMinutesPerPatient: settings.waitingRoomMinutesPerPatient ?? null,
          settlementPeriodPreset: settings.settlementPeriodPreset,
          settlementPeriodDays: settings.settlementPeriodDays ?? null,
        },
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateOrganizationSettings(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermission('org:manage');
    const parsed = organizationSettingsSchema.safeParse({
      name: formData.get('name'),
      timezone: formData.get('timezone'),
      currency: formData.get('currency'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      taxId: formData.get('taxId'),
      waitingRoomRoomsText: formData.get('waitingRoomRoomsText') ?? '',
      waitingRoomMinutesPerPatient: formData.get('waitingRoomMinutesPerPatient') ?? '',
      waitingRoomPortalAlertsEnabled: formData.get('waitingRoomPortalAlertsEnabled') ?? '',
      waitingRoomWhatsAppAutoEnabled: formData.get('waitingRoomWhatsAppAutoEnabled') ?? '',
      waitingRoomBoardSoundEnabled: formData.get('waitingRoomBoardSoundEnabled') ?? '',
      settlementPeriodPreset: formData.get('settlementPeriodPreset') ?? '',
      settlementPeriodDays: formData.get('settlementPeriodDays') ?? '',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const organization = await getOrganization();
    if (!organization) {
      return { success: false, error: 'Clínica no encontrada' };
    }

    const waitingRoomRooms = normalizeWaitingRoomRooms(parsed.data.waitingRoomRoomsText);
    const waitingRoomMinutesPerPatient =
      parsed.data.waitingRoomMinutesPerPatient === '' ||
      parsed.data.waitingRoomMinutesPerPatient == null
        ? null
        : parsed.data.waitingRoomMinutesPerPatient;
    const waitingRoomPortalAlertsEnabled =
      parsed.data.waitingRoomPortalAlertsEnabled === 'on' ||
      parsed.data.waitingRoomPortalAlertsEnabled === 'true';
    const waitingRoomWhatsAppAutoEnabled =
      parsed.data.waitingRoomWhatsAppAutoEnabled === 'on' ||
      parsed.data.waitingRoomWhatsAppAutoEnabled === 'true';
    const waitingRoomBoardSoundEnabled =
      parsed.data.waitingRoomBoardSoundEnabled === 'on' ||
      parsed.data.waitingRoomBoardSoundEnabled === 'true';
    const settlementPeriodPreset =
      parsed.data.settlementPeriodPreset === 'biweekly' ||
      parsed.data.settlementPeriodPreset === 'custom' ||
      parsed.data.settlementPeriodPreset === 'month'
        ? parsed.data.settlementPeriodPreset
        : 'month';
    const settlementPeriodDays =
      parsed.data.settlementPeriodDays === '' || parsed.data.settlementPeriodDays == null
        ? null
        : parsed.data.settlementPeriodDays;

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('organizations')
      .update({
        name: parsed.data.name,
        settings: mergeOrganizationSettings(organization.settings, {
          timezone: parsed.data.timezone,
          currency: parsed.data.currency,
          phone: parsed.data.phone,
          email: parsed.data.email,
          taxId: parsed.data.taxId,
          waitingRoomRooms,
          waitingRoomMinutesPerPatient,
          waitingRoomPortalAlertsEnabled,
          waitingRoomWhatsAppAutoEnabled,
          waitingRoomBoardSoundEnabled,
          settlementPeriodPreset,
          settlementPeriodDays,
        }) as Json,
      })
      .eq('id', session.organizationId);

    if (error) {
      return { success: false, error: 'No se pudo guardar la configuración' };
    }

    revalidatePath('/configuracion');
    revalidatePath('/sala-espera');
    revalidatePath('/portal/sala-espera');
    revalidatePath('/liquidaciones');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function listBranches(
  input: { page?: number; pageSize?: number; search?: string } = {}
): Promise<PaginatedResult<Branch>> {
  await requireSession();
  const parsed = branchListSchema.parse(input);
  const supabase = await createServerClient();

  let query = supabase
    .from('branches')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('is_main', { ascending: false })
    .order('name');

  if (parsed.search) {
    query = query.or(`name.ilike.%${parsed.search}%,code.ilike.%${parsed.search}%`);
  }

  const from = (parsed.page - 1) * parsed.pageSize;
  const { data, count, error } = await query.range(from, from + parsed.pageSize - 1);

  if (error) throw error;

  return buildPaginatedResult((data ?? []) as Branch[], count ?? 0, parsed.page, parsed.pageSize);
}

export async function createBranch(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermission('branch:manage');
    const parsed = branchSchema.safeParse({
      name: formData.get('name'),
      code: formData.get('code'),
      address: formData.get('address'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      timezone: formData.get('timezone'),
      isActive: formData.get('isActive') ?? true,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { count } = await supabase
      .from('branches')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    await assertWithinLimit({
      organizationId: session.organizationId,
      featureKey: FEATURES.BRANCHES_MAX,
      currentCount: count ?? 0,
    });

    const { error } = await supabase
      .from('branches')
      .insert({
        organization_id: session.organizationId,
        name: parsed.data.name,
        code: parsed.data.code,
        address: parsed.data.address || null,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        timezone: parsed.data.timezone,
        is_active: parsed.data.isActive,
      });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Ya existe una sucursal con ese código' };
      }
      return { success: false, error: 'No se pudo crear la sucursal' };
    }

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateBranch(
  branchId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermission('branch:manage');
    const parsed = branchSchema.safeParse({
      name: formData.get('name'),
      code: formData.get('code'),
      address: formData.get('address'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      timezone: formData.get('timezone'),
      isActive: formData.get('isActive') === 'true',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('branches')
      .update({
        name: parsed.data.name,
        code: parsed.data.code,
        address: parsed.data.address || null,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        timezone: parsed.data.timezone,
        is_active: parsed.data.isActive,
      })
      .eq('id', branchId);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Ya existe una sucursal con ese código' };
      }
      return { success: false, error: 'No se pudo actualizar la sucursal' };
    }

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteBranch(branchId: string): Promise<ActionResult> {
  try {
    await requirePermission('branch:manage');
    const supabase = await createServerClient();

    const { data: branch } = await supabase
      .from('branches')
      .select('is_main')
      .eq('id', branchId)
      .single();

    if (branch?.is_main) {
      return { success: false, error: 'No podés eliminar la sucursal principal' };
    }

    const { error } = await supabase
      .from('branches')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', branchId);

    if (error) {
      return { success: false, error: 'No se pudo eliminar la sucursal' };
    }

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function listTeamMembers(
  input: { page?: number; pageSize?: number; search?: string } = {}
): Promise<PaginatedResult<TeamMemberRow>> {
  await requirePermission('users:manage');
  const parsed = teamListSchema.parse(input);
  const supabase = await createServerClient();

  const { data: members, count, error } = await supabase
    .from('branch_members')
    .select('id, user_id, branch_id, role, is_active', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .range((parsed.page - 1) * parsed.pageSize, parsed.page * parsed.pageSize - 1);

  if (error) throw error;
  if (!members?.length) {
    return buildPaginatedResult([], count ?? 0, parsed.page, parsed.pageSize);
  }

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const branchIds = [...new Set(members.map((m) => m.branch_id))];

  const [{ data: profiles }, { data: branches }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', userIds),
    supabase.from('branches').select('id, name').in('id', branchIds),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const branchMap = new Map((branches ?? []).map((b) => [b.id, b.name]));

  let rows: TeamMemberRow[] = members.map((row) => ({
    memberId: row.id,
    userId: row.user_id,
    fullName: profileMap.get(row.user_id) ?? 'Sin nombre',
    email: null,
    branchId: row.branch_id,
    branchName: branchMap.get(row.branch_id) ?? '—',
    role: row.role as Role,
    isActive: row.is_active,
  }));

  if (parsed.search) {
    const term = parsed.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(term) || r.branchName.toLowerCase().includes(term)
    );
  }

  return buildPaginatedResult(rows, count ?? 0, parsed.page, parsed.pageSize);
}

export async function updateTeamMember(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermission('users:manage');
    const parsed = updateMemberSchema.safeParse({
      memberId: formData.get('memberId'),
      role: formData.get('role'),
      isActive: formData.get('isActive') === 'true',
    });

    if (!parsed.success) {
      return { success: false, error: 'Datos inválidos' };
    }

    const supabase = await createServerClient();
    const { data: member } = await supabase
      .from('branch_members')
      .select('role, is_active, deleted_at')
      .eq('id', parsed.data.memberId)
      .maybeSingle();
    const currentlyActiveVet =
      member?.role === 'veterinarian' && member.is_active === true && member.deleted_at == null;
    const willBeActiveVet = parsed.data.role === 'veterinarian' && parsed.data.isActive;
    if (willBeActiveVet && !currentlyActiveVet) {
      await assertVeterinarianSeatAvailable(session.organizationId);
    }

    const { error } = await supabase
      .from('branch_members')
      .update({
        role: parsed.data.role,
        is_active: parsed.data.isActive,
        deleted_at: parsed.data.isActive ? null : new Date().toISOString(),
      })
      .eq('id', parsed.data.memberId);

    if (error) {
      return { success: false, error: 'No se pudo actualizar el miembro' };
    }

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function inviteTeamMember(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermission('users:manage');
    const parsed = inviteMemberSchema.safeParse({
      email: formData.get('email'),
      branchId: formData.get('branchId'),
      role: formData.get('role'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabaseForLimit = await createServerClient();
    const service = await createServiceClient();

    const { data: existingUsers } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const existingUser = existingUsers.users.find(
      (u) => u.email?.toLowerCase() === parsed.data.email
    );

    let alreadyInOrg = false;
    if (existingUser) {
      const { data: existingProfile } = await supabaseForLimit
        .from('profiles')
        .select('id')
        .eq('id', existingUser.id)
        .is('deleted_at', null)
        .maybeSingle();
      alreadyInOrg = Boolean(existingProfile);
    }

    if (!alreadyInOrg) {
      const [{ count: profileCount }, { count: inviteCount }] = await Promise.all([
        supabaseForLimit
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .is('deleted_at', null),
        supabaseForLimit
          .from('organization_invitations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .is('deleted_at', null),
      ]);
      await assertWithinLimit({
        organizationId: session.organizationId,
        featureKey: FEATURES.USERS_MAX,
        currentCount: (profileCount ?? 0) + (inviteCount ?? 0),
      });
    }

    if (parsed.data.role === 'veterinarian') {
      let alreadyVet = false;
      if (existingUser) {
        const { data: vetRow } = await supabaseForLimit
          .from('branch_members')
          .select('id')
          .eq('user_id', existingUser.id)
          .eq('role', 'veterinarian')
          .eq('is_active', true)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        alreadyVet = Boolean(vetRow);
      }
      if (!alreadyVet) {
        await assertVeterinarianSeatAvailable(session.organizationId);
      }
    }

    if (existingUser) {
      const supabase = await createServerClient();
      const { error: rpcError } = await supabase.rpc('add_team_member', {
        p_user_id: existingUser.id,
        p_branch_id: parsed.data.branchId,
        p_role: parsed.data.role,
      });

      if (rpcError) {
        return { success: false, error: rpcError.message };
      }

      revalidatePath('/configuracion');
      return { success: true, data: undefined };
    }

    const supabase = await createServerClient();
    const { error: inviteInsertError } = await supabase.from('organization_invitations').insert({
      organization_id: session.organizationId,
      branch_id: parsed.data.branchId,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: session.userId,
    });

    if (inviteInsertError) {
      if (inviteInsertError.code === '23505') {
        return { success: false, error: 'Ya hay una invitación pendiente para este email' };
      }
      return { success: false, error: 'No se pudo crear la invitación' };
    }

    const { error: inviteError } = await service.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: {
        organization_id: session.organizationId,
        branch_id: parsed.data.branchId,
        role: parsed.data.role,
      },
    });

    if (inviteError) {
      return {
        success: false,
        error: 'Invitación registrada pero no se pudo enviar el email',
      };
    }

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function listPendingInvitations(): Promise<OrganizationInvitation[]> {
  await requirePermission('users:manage');
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as OrganizationInvitation[];
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  try {
    await requirePermission('users:manage');
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('organization_invitations')
      .update({ status: 'revoked', deleted_at: new Date().toISOString() })
      .eq('id', invitationId);

    if (error) {
      return { success: false, error: 'No se pudo revocar la invitación' };
    }

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setActiveBranch(branchId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const parsed = setActiveBranchSchema.safeParse({ branchId });
    if (!parsed.success) {
      return { success: false, error: 'Sucursal inválida' };
    }

    const supabase = await createServerClient();
    const { data: hasAccess } = await supabase.rpc('user_has_branch_access', {
      p_branch_id: parsed.data.branchId,
    });

    if (!hasAccess) {
      return { success: false, error: 'No tenés acceso a esa sucursal' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({ active_branch_id: parsed.data.branchId })
      .eq('id', session.userId);

    if (error) {
      return { success: false, error: 'No se pudo cambiar la sucursal' };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function getUserBranches(): Promise<
  Array<{ id: string; name: string; code: string; is_main: boolean; is_active: boolean }>
> {
  return loadUserBranches();
}

const loadUserBranches = cache(async () => {
  const session = await requireSession();
  const supabase = await createServerClient();

  const { data: memberships } = await supabase
    .from('branch_members')
    .select('branch_id')
    .eq('user_id', session.userId)
    .eq('is_active', true)
    .is('deleted_at', null);

  const branchIds = (memberships ?? []).map((m) => m.branch_id);
  if (branchIds.length === 0) return [];

  const { data, error } = await supabase
    .from('branches')
    .select('id, name, code, is_main, is_active')
    .in('id', branchIds)
    .is('deleted_at', null)
    .order('is_main', { ascending: false })
    .order('name');

  if (error) throw error;
  return data ?? [];
});
