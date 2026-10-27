import { redirect } from 'next/navigation';
import { getSessionContext } from '@/actions/auth';
import {
  acceptPendingInvitation,
  invitationActivated,
} from '@/lib/auth/accept-pending-invitation';
import { createServerClient } from '@/lib/supabase/server';

export default async function HomeRouterPage() {
  const session = await getSessionContext();

  if (session?.kind === 'portal') {
    redirect('/portal');
  }

  if (session?.kind === 'staff') {
    redirect('/dashboard');
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Do not re-call cached getSessionContext() after accept — React.cache would
    // reuse the pre-accept null and bounce to incomplete_account.
    const accepted = await acceptPendingInvitation(supabase, user.id);
    if (invitationActivated(accepted.status)) {
      redirect('/dashboard');
    }

    console.error('[home] incomplete_account', {
      userId: user.id,
      email: user.email,
      status: accepted.status,
      detail: accepted.detail,
    });

    await supabase.auth.signOut();
    const params = new URLSearchParams({ error: 'incomplete_account' });
    if (accepted.status === 'no_invitation') {
      params.set('reason', 'no_invitation');
    } else if (accepted.status === 'missing_rpc') {
      params.set('reason', 'missing_rpc');
    } else if (accepted.status === 'other_organization') {
      params.set('reason', 'other_organization');
    }
    redirect(`/login?${params.toString()}`);
  }

  redirect('/login');
}
