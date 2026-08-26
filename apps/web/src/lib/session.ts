import { cache } from 'react';
import {
  getPermissionsForRole,
  resolvePlatformAdminAccess,
  type Permission,
  type Role,
  type SessionContext,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { readServerEnv } from '@/lib/server-env';

/**
 * Request-scoped session loader. Deduplicates auth.getUser + profile + memberships
 * across layout, pages, can*, and requirePermission within a single RSC/action render.
 * Does not cache across requests or tenants.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: isDbPlatformAdmin, error: platformAdminError } = await supabase.rpc(
    'is_platform_admin'
  );
  const isPlatformAdmin = resolvePlatformAdminAccess({
    email: user.email,
    allowlistRaw: readServerEnv('SUPERADMIN_EMAILS'),
    isDbPlatformAdmin: !platformAdminError && isDbPlatformAdmin === true,
  });

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, organization_id, full_name, avatar_url, phone, active_branch_id, is_active, created_at, updated_at, deleted_at'
    )
    .eq('id', user.id)
    .is('deleted_at', null)
    .single();

  if (!profile) return null;

  const { data: memberships } = await supabase
    .from('branch_members')
    .select('branch_id, role, permissions')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const activeMembership =
    memberships?.find((m) => m.branch_id === profile.active_branch_id) ??
    memberships?.[0] ??
    null;

  if (activeMembership) {
    const role = activeMembership.role as Role;
    const customPerms = activeMembership.permissions as Permission[] | null;

    return {
      userId: user.id,
      organizationId: profile.organization_id,
      branchId: activeMembership.branch_id,
      kind: 'staff',
      role,
      permissions: getPermissionsForRole(role, customPerms),
      profile: {
        id: profile.id,
        organization_id: profile.organization_id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        phone: profile.phone,
        active_branch_id: profile.active_branch_id,
        is_active: profile.is_active,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        deleted_at: profile.deleted_at,
      },
      ownerId: null,
      isPlatformAdmin,
    };
  }

  const { data: portalOwnerId } = await supabase.rpc('get_portal_owner_id');
  if (!portalOwnerId) return null;

  return {
    userId: user.id,
    organizationId: profile.organization_id,
    branchId: null,
    kind: 'portal',
    role: null,
    permissions: [],
    profile: {
      id: profile.id,
      organization_id: profile.organization_id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      phone: profile.phone,
      active_branch_id: profile.active_branch_id,
      is_active: profile.is_active,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      deleted_at: profile.deleted_at,
    },
    ownerId: portalOwnerId,
    isPlatformAdmin,
  };
});
