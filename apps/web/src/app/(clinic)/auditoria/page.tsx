import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { canReadAudit, listAuditLogs } from '@/actions/audit';
import { AuditLogList } from '@/components/audit/audit-log-list';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_LIQUIDACIONES_FAMILY,
  defaultAuditRange,
  isValidAuditRange,
  type AuditAction,
  type AuditEntityType,
} from '@sincvete/shared';

interface AuditoriaPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AuditoriaPage({ searchParams }: AuditoriaPageProps) {
  const canRead = await canReadAudit();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const fallback = defaultAuditRange();
  const from = params.from?.trim() || fallback.from;
  const to = params.to?.trim() || fallback.to;
  const range = isValidAuditRange(from, to) ? { from, to } : fallback;

  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const actionParam = params.action?.trim() ?? '';
  const action = AUDIT_ACTIONS.includes(actionParam as AuditAction)
    ? (actionParam as AuditAction)
    : undefined;
  const entityParam = params.entityType?.trim() ?? '';
  const entityType =
    entityParam === AUDIT_LIQUIDACIONES_FAMILY ||
    AUDIT_ENTITY_TYPES.includes(entityParam as AuditEntityType)
      ? entityParam
      : undefined;

  const data = await listAuditLogs({
    page,
    pageSize: 25,
    search: search || undefined,
    action,
    entityType,
    from: range.from,
    to: range.to,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoría</h1>
        <p className="text-muted-foreground">
          Historial de altas, cambios y bajas. Solo lectura para dueños y administradores.
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando eventos...</div>}>
        <AuditLogList
          data={data}
          initialSearch={search}
          initialAction={action ?? ''}
          initialEntityType={entityType ?? ''}
          initialFrom={range.from}
          initialTo={range.to}
        />
      </Suspense>
    </div>
  );
}
