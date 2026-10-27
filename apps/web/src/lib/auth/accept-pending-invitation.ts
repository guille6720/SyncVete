import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@sincvete/db';
import { createServiceClient } from '@/lib/supabase/server';

export type AcceptInvitationStatus =
  | 'accepted'
  | 'already_member'
  | 'no_invitation'
  | 'email_unconfirmed'
  | 'unauthenticated'
  | 'other_organization'
  | 'missing_rpc'
  | 'error'
  | `account_${string}`;

export interface AcceptInvitationResult {
  status: AcceptInvitationStatus;
  detail?: string;
}

function parseStatus(data: unknown): AcceptInvitationStatus {
  if (!data || typeof data !== 'object') return 'error';
  const status = (data as { status?: unknown }).status;
  if (typeof status !== 'string' || !status) return 'error';
  return status as AcceptInvitationStatus;
}

async function runAcceptRpc(
  supabase: SupabaseClient<Database>
): Promise<AcceptInvitationResult> {
  const { data, error } = await supabase.rpc('accept_pending_invitation');
  if (error) {
    const message = error.message ?? String(error);
    const missing =
      /could not find the function|schema cache|does not exist|PGRST202/i.test(message);
    console.error('[accept_pending_invitation]', message);
    return {
      status: missing ? 'missing_rpc' : 'error',
      detail: message,
    };
  }
  return { status: parseStatus(data) };
}

/**
 * Service-role fallback that mirrors accept_pending_invitation when the RPC is
 * missing or blocked on email_confirmed_at.
 */
async function activateInvitationWithServiceRole(
  userId: string,
  email: string
): Promise<AcceptInvitationResult> {
  try {
    const service = await createServiceClient();
    const normalized = email.trim().toLowerCase();

    await service.auth.admin.updateUserById(userId, { email_confirm: true });

    // Staging may have columns (account_status, accepted_at, denied_permissions)
    // ahead of generated Database types — use a loosely typed client here.
    const db = service as unknown as SupabaseClient;

    const { data: existingProfile } = await db
      .from('profiles')
      .select('id, organization_id, account_status, deleted_at, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile && !existingProfile.deleted_at) {
      const { data: memberships } = await db
        .from('branch_members')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(1);
      if (memberships && memberships.length > 0) {
        return { status: 'already_member' };
      }
      if (existingProfile.account_status && existingProfile.account_status !== 'active') {
        return { status: `account_${existingProfile.account_status}` };
      }
    }

    const { data: invitation, error: inviteError } = await db
      .from('organization_invitations')
      .select(
        'id, organization_id, branch_id, email, role, full_name, phone, denied_permissions, invited_by, status, expires_at, deleted_at'
      )
      .eq('status', 'pending')
      .is('deleted_at', null)
      .gt('expires_at', new Date().toISOString())
      .ilike('email', normalized)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error('[activateInvitationWithServiceRole] invite', inviteError.message);
      return { status: 'error', detail: inviteError.message };
    }
    if (!invitation) {
      return { status: 'no_invitation' };
    }

    if (
      existingProfile &&
      !existingProfile.deleted_at &&
      existingProfile.organization_id !== invitation.organization_id
    ) {
      return { status: 'other_organization' };
    }

    const { error: acceptMarkError } = await db
      .from('organization_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)
      .eq('status', 'pending');
    if (acceptMarkError) {
      return { status: 'error', detail: acceptMarkError.message };
    }

    const fullName =
      (invitation.full_name as string | null)?.trim() || normalized.split('@')[0] || 'Usuario';

    const { error: profileError } = await db.from('profiles').upsert(
      {
        id: userId,
        organization_id: invitation.organization_id,
        full_name: fullName,
        phone: invitation.phone,
        active_branch_id: invitation.branch_id,
        is_active: true,
        account_status: 'active',
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (profileError) {
      console.error('[activateInvitationWithServiceRole] profile', profileError.message);
      return { status: 'error', detail: profileError.message };
    }

    const { error: memberError } = await db.from('branch_members').upsert(
      {
        organization_id: invitation.organization_id,
        branch_id: invitation.branch_id,
        user_id: userId,
        role: invitation.role,
        is_active: true,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'branch_id,user_id' }
    );
    if (memberError) {
      console.error('[activateInvitationWithServiceRole] member', memberError.message);
      return { status: 'error', detail: memberError.message };
    }

    const denied = Array.isArray(invitation.denied_permissions)
      ? (invitation.denied_permissions as string[])
      : [];
    if (denied.length > 0) {
      const rows = denied.map((permission_key) => ({
        organization_id: invitation.organization_id,
        user_id: userId,
        permission_key,
        enabled: false,
        created_by: invitation.invited_by,
      }));
      const { error: deniedError } = await db
        .from('user_permission_overrides')
        .upsert(rows, { onConflict: 'organization_id,user_id,permission_key' });
      if (deniedError) {
        console.error('[activateInvitationWithServiceRole] denied', deniedError.message);
      }
    }

    return { status: 'accepted' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[activateInvitationWithServiceRole]', detail);
    return { status: 'error', detail };
  }
}

/**
 * Binds a pending organization invitation to the current Auth user.
 * Tries the SQL RPC first; on email_unconfirmed / missing RPC / failure, falls
 * back to a service-role activation that does not depend on email_confirmed_at.
 */
export async function acceptPendingInvitation(
  supabase: SupabaseClient<Database>,
  userId: string,
  email?: string | null
): Promise<AcceptInvitationResult> {
  let result = await runAcceptRpc(supabase);

  if (result.status === 'email_unconfirmed') {
    try {
      const service = await createServiceClient();
      const { error } = await service.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });
      if (error) {
        console.error('[accept_pending_invitation] email_confirm', error.message);
      } else {
        result = await runAcceptRpc(supabase);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[accept_pending_invitation] email_confirm', detail);
    }
  }

  if (invitationActivated(result.status)) {
    return result;
  }

  let resolvedEmail = email?.trim().toLowerCase() ?? null;
  if (!resolvedEmail) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    resolvedEmail = user?.email?.trim().toLowerCase() ?? null;
  }

  if (
    resolvedEmail &&
    (result.status === 'email_unconfirmed' ||
      result.status === 'missing_rpc' ||
      result.status === 'error' ||
      result.status === 'no_invitation' ||
      result.status === 'unauthenticated')
  ) {
    const fallback = await activateInvitationWithServiceRole(userId, resolvedEmail);
    if (invitationActivated(fallback.status) || fallback.status !== 'no_invitation') {
      return fallback;
    }
  }

  return result;
}

export function invitationActivated(status: AcceptInvitationStatus): boolean {
  return status === 'accepted' || status === 'already_member';
}
