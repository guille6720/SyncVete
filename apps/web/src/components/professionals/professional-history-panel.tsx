import Link from 'next/link';
import { listAuditLogs } from '@/actions/audit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelativeTime } from '@sincvete/shared';

interface ProfessionalHistoryPanelProps {
  professionalId: string;
  canReadAudit: boolean;
}

export async function ProfessionalHistoryPanel({
  professionalId,
  canReadAudit,
}: ProfessionalHistoryPanelProps) {
  if (!canReadAudit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>No tenés permiso de auditoría para ver este historial.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const logs = await listAuditLogs({
    page: 1,
    pageSize: 25,
    entityType: 'professionals',
    search: professionalId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial</CardTitle>
        <CardDescription>
          Cambios auditados sobre este profesional.{' '}
          <Link href={`/auditoria?entityType=professionals&search=${professionalId}`} className="underline">
            Ver en Auditoría
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos registrados todavía.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {logs.data.map((row) => (
              <li key={row.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{row.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(row.created_at)}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {row.user_full_name ?? 'Sistema'} · {row.entity_type}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
