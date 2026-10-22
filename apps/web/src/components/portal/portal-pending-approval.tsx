'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** Waiting room after signup; polls until the clinic activates portal access. */
export function PortalPendingApproval() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTicks((n) => n + 1);
      startTransition(() => {
        router.refresh();
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [router]);

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border p-6">
      <h1 className="text-xl font-semibold">Cuenta creada</h1>
      <p className="text-sm text-muted-foreground">
        Tu veterinaria todavía tiene que activar el acceso. Cuando lo haga vas a poder ver tus
        mascotas, vacunas y turnos acá.
      </p>
      <p className="text-xs text-muted-foreground">
        Esta pantalla se actualiza sola. Si ya te activaron, tocá el botón.
      </p>
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        {pending ? 'Comprobando…' : 'Ya me activaron — entrar'}
      </Button>
      <p className="sr-only" aria-live="polite">
        Comprobación {ticks}
      </p>
    </div>
  );
}
