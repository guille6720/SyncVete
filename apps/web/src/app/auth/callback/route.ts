import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/home';
  }
  return next;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = safeNextPath(searchParams.get('next'));
  const authError = searchParams.get('error');
  const authErrorDescription = searchParams.get('error_description');

  if (authError) {
    const params = new URLSearchParams({ error: 'auth_callback' });
    if (authErrorDescription) {
      params.set('message', authErrorDescription);
    }
    redirect(`/login?${params.toString()}`);
  }

  const supabase = await createServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(next);
    }
  }

  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (!error) {
      redirect(next);
    }
  }

  redirect('/actualizar-contrasena?error=auth_callback');
}
