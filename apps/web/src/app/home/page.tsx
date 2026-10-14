import { redirect } from 'next/navigation';
import { getSessionContext } from '@/actions/auth';
import { createServerClient } from '@/lib/supabase/server';

type AccountState = { has_profile: boolean; account_status: string | null } | null;
type AcceptResult = { status: string } | null;

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

  if (!user) {
    redirect('/login');
  }

  const { data: stateRaw } = await supabase.rpc('get_my_account_state');
  const state = stateRaw as AccountState;
  if (state?.has_profile && state.account_status && state.account_status !== 'active') {
    await supabase.auth.signOut();
    redirect(`/login?error=account_${state.account_status}`);
  }

  // First login of an invited team member: bind the pending invitation (matched by the
  // verified auth email, never by user metadata) to a profile + branch membership.
  const { data: acceptRaw } = await supabase.rpc('accept_pending_invitation');
  const accepted = acceptRaw as AcceptResult;
  if (accepted?.status === 'accepted') {
    redirect('/dashboard');
  }

  // Auth ok but no clinic profile yet — send back to login with a clear reason
  // instead of signing out silently (looks like "can't enter").
  await supabase.auth.signOut();
  redirect('/login?error=incomplete_account');
}
