'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export function RecoverySessionBootstrap() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishSession() {
      const supabase = createBrowserClient();

      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        if (accessToken && refreshToken && (!type || type === 'recovery')) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error) {
            window.history.replaceState({}, '', window.location.pathname);
            if (!cancelled) {
              setHasSession(true);
              setStatus('ready');
              router.refresh();
            }
            return;
          }
        }
      }

      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          window.history.replaceState({}, '', window.location.pathname);
          if (!cancelled) {
            setHasSession(true);
            setStatus('ready');
            router.refresh();
          }
          return;
        }
      }

      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      if (tokenHash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (!error) {
          window.history.replaceState({}, '', window.location.pathname);
          if (!cancelled) {
            setHasSession(true);
            setStatus('ready');
            router.refresh();
          }
          return;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) {
        setHasSession(Boolean(user));
        setStatus('ready');
      }
    }

    void establishSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === 'loading') {
    return (
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        Verificando enlace de recuperación…
      </p>
    );
  }

  return <ResetPasswordForm hasSession={hasSession} />;
}
