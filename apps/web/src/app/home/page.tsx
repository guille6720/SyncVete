import { redirect } from 'next/navigation';
import { getSessionContext } from '@/actions/auth';
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
    // Invited users may have Auth but no profile until this RPC runs.
    await supabase.rpc('accept_pending_invitation');
    const afterInvite = await getSessionContext();
    if (afterInvite?.kind === 'portal') {
      redirect('/portal');
    }
    if (afterInvite?.kind === 'staff') {
      redirect('/dashboard');
    }

    // Auth ok but no clinic profile yet — send back to login with a clear reason
    // instead of signing out silently (looks like "can't enter").
    await supabase.auth.signOut();
    redirect('/login?error=incomplete_account');
  }

  redirect('/login');
}
