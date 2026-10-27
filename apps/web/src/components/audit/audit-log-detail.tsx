import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_VARIANT,
  auditChangedFields,
  auditEntityLabel,
  formatAuditValue,
  formatClinicalEntryDateTime,
  isAuditAction,
  type AuditLogDetail,
} from '@sincvete/shared';

interface AuditLogDetailViewProps {
  log: AuditLogDetail;
}

export function AuditLogDetailView({ log }: AuditLogDetailViewProps) {
  const action = isAuditAction(log.action) ? log.action : 'update';
  const changes = auditChangedFields(log.old_data, log.new_data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/auditoria">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a auditoría
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{log.summary}</CardTitle>
            <Badge variant={AUDIT_ACTION_VARIANT[action]}>{AUDIT_ACTION_LABELS[action]}</Badge>
            <Badge>{auditEntityLabel(log.entity_type)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(log.created_at)}
            {log.user_full_name ? ` · ${log.user_full_name}` : ' · Sistema'}
            {log.branch_name ? ` · ${log.branch_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cambios de campos para mostrar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Campo</th>
                    <th className="py-2 pr-4 font-medium">Antes</th>
                    <th className="py-2 font-medium">Después</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((field) => (
                    <tr key={field.key} className="border-b align-top last:border-0">
                      <td className="py-2 pr-4 font-medium">{field.key}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatAuditValue(field.oldValue)}
                      </td>
                      <td className="py-2">{formatAuditValue(field.newValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
