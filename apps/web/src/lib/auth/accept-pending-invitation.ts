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

async function runAccept(
  supabase: SupabaseClient<Database>
): Promise<{ status: AcceptInvitationStatus; detail?: string }> {
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
 * Binds a pending organization invitation to the current Auth user.
 * If Auth left email_confirmed_at null (common on some invite paths), confirm via
 * service role and retry once.
 */
export async function acceptPendingInvitation(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AcceptInvitationResult> {
  let result = await runAccept(supabase);

  if (result.status === 'email_unconfirmed') {
    try {
      const service = await createServiceClient();
      const { error } = await service.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });
      if (error) {
        console.error('[accept_pending_invitation] email_confirm', error.message);
        return { status: 'email_unconfirmed', detail: error.message };
      }
      result = await runAccept(supabase);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[accept_pending_invitation] email_confirm', detail);
      return { status: 'email_unconfirmed', detail };
    }
  }

  return result;
}

export function invitationActivated(status: AcceptInvitationStatus): boolean {
  return status === 'accepted' || status === 'already_member';
}
