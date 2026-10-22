'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_NAME } from '@sincvete/shared';

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'local';
const POLL_MS = 20_000;

async function hardReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.update()));
      const waiting = regs.map((reg) => reg.waiting).find(Boolean);
      waiting?.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch {
    // reload anyway
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_sv', String(Date.now()));
  window.location.replace(url.toString());
}

export function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const markAvailable = () => {
      if (!cancelled) setUpdateAvailable(true);
    };

    async function checkVersion() {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        const remote = data.version?.trim();
        if (!remote || remote === 'local') return;
        if (remote !== BUILD_ID) markAvailable();
      } catch {
        // ignore network errors
      }
    }

    void checkVersion();
    const id = window.setInterval(checkVersion, POLL_MS);
    const onFocus = () => void checkVersion();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    const onSwUpdate = () => markAvailable();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('syncvete:app-update', onSwUpdate);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('syncvete:app-update', onSwUpdate);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex justify-center p-3 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border-2 border-teal-500/50 bg-card px-4 py-3 text-sm shadow-2xl"
      >
        <p className="min-w-0 flex-1 text-foreground">
          Hay una <span className="font-semibold">actualización</span> de {APP_NAME} disponible.
        </p>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--clinic, #3f6b4a)' }}
          onClick={() => {
            void hardReload();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>
    </div>
  );
}
