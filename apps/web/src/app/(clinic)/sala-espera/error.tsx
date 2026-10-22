'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function SalaEsperaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[sala-espera]', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">No se pudo cargar la sala de espera</h1>
      <p className="text-sm text-muted-foreground">
        Hubo un error al mostrar la cola. Podés reintentar o volver al dashboard.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          Reintentar
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Ir al dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
