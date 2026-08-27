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

type BootstrapMembership = {
  branch_id: string;
  role: string;
  permissions: Permission[] | null;
};

type BootstrapProfile = {
  id: string;
  organization_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  active_branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SessionBootstrap = {
  is_platform_admin: boolean;
  profile: BootstrapProfile;
  memberships: BootstrapMembership[];
  portal_owner_id: string | null;
};

function profileToSession(profile: BootstrapProfile): SessionContext['profile'] {
  return {
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
  };
}

/**
 * Request-scoped session loader. Prefer one RPC (`get_session_bootstrap`) when
 * available; fall back to parallel queries for environments without the migration.
 * Deduplicates across layout/pages/can* within a single RSC/action render.
 * Does not cache across requests or tenants. Always uses auth.getUser() for
 * cookie validation / revocation semantics (not getClaims-only).
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: bootstrapRaw, error: bootstrapError } = await supabase.rpc('get_session_bootstrap');

  if (!bootstrapError && bootstrapRaw) {
    const bootstrap = bootstrapRaw as unknown as SessionBootstrap;
    const isPlatformAdmin = resolvePlatformAdminAccess({
      email: user.email,
      allowlistRaw: readServerEnv('SUPERADMIN_EMAILS'),
      isDbPlatformAdmin: bootstrap.is_platform_admin === true,
    });

    const profile = bootstrap.profile;
    if (!profile?.id) return null;

    const memberships = Array.isArray(bootstrap.memberships) ? bootstrap.memberships : [];
    const activeMembership =
      memberships.find((m) => m.branch_id === profile.active_branch_id) ?? memberships[0] ?? null;

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
        profile: profileToSession(profile),
        ownerId: null,
        isPlatformAdmin,
      };
    }

    const portalOwnerId =
      typeof bootstrap.portal_owner_id === 'string' ? bootstrap.portal_owner_id : null;
    if (!portalOwnerId) return null;

    return {
      userId: user.id,
      organizationId: profile.organization_id,
      branchId: null,
      kind: 'portal',
      role: null,
      permissions: [],
      profile: profileToSession(profile),
      ownerId: portalOwnerId,
      isPlatformAdmin,
    };
  }

  // Fallback: parallel queries (pre-migration / missing RPC).
  if (bootstrapError && !/schema cache|does not exist|Could not find the function/i.test(bootstrapError.message)) {
    console.warn('[session] get_session_bootstrap', bootstrapError.message);
  }

  const [platformAdminRes, profileRes, membershipsRes] = await Promise.all([
    supabase.rpc('is_platform_admin'),
    supabase
      .from('profiles')
      .select(
        'id, organization_id, full_name, avatar_url, phone, active_branch_id, is_active, created_at, updated_at, deleted_at'
      )
      .eq('id', user.id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('branch_members')
      .select('branch_id, role, permissions')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ]);

  const isPlatformAdmin = resolvePlatformAdminAccess({
    email: user.email,
    allowlistRaw: readServerEnv('SUPERADMIN_EMAILS'),
    isDbPlatformAdmin: !platformAdminRes.error && platformAdminRes.data === true,
  });

  const profile = profileRes.data;
  if (!profile) return null;

  const memberships = membershipsRes.data;
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
      profile: profileToSession(profile),
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
    profile: profileToSession(profile),
    ownerId: portalOwnerId,
    isPlatformAdmin,
  };
});
