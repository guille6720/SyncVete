'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { explainAgendaProblem } from '@/lib/agenda-problems';

export function AgendaProblemNotice({
  message,
  hoursHref,
  onSlots,
  onRetry,
}: {
  message: string;
  hoursHref?: string;
  onSlots?: () => void;
  onRetry?: () => void;
}) {
  const problem = explainAgendaProblem(message);
  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-amber-400/60 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {problem.title}
      </p>
      <p className="text-sm">{problem.message}</p>
      {problem.action === 'hours' && hoursHref ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={hoursHref}>{problem.label}</Link>
        </Button>
      ) : null}
      {problem.action === 'slots' && onSlots ? (
        <Button type="button" variant="outline" size="sm" onClick={onSlots}>
          {problem.label}
        </Button>
      ) : null}
      {problem.action === 'retry' && onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {problem.label}
        </Button>
      ) : null}
      {problem.action === 'permission' ? (
        <p className="text-xs">
          Permisos necesarios: Profesionales → editar ficha; Agenda → crear y modificar turnos. Los
          habilita un administrador en Usuarios y permisos.
        </p>
      ) : null}
    </div>
  );
}
