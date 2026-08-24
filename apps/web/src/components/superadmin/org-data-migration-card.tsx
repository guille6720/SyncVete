import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SuperadminOrgMigrationStats } from '@/actions/data-migration';

export function SuperadminOrgDataMigrationCard({
  stats,
}: {
  stats: SuperadminOrgMigrationStats | null;
}) {
  if (!stats) {
    return (
      <Card id="data-migration">
        <CardHeader>
          <CardTitle>Import / Export</CardTitle>
          <CardDescription>Sin datos de migración para esta organización.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="data-migration">
      <CardHeader>
        <CardTitle>Import / Export</CardTitle>
        <CardDescription>
          Vista read-only de lotes de la clínica (tenant-safe). No permite mutar datos de otro tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-3 text-muted-foreground">
          <span>
            Imports: {String(stats.importTotals.batches ?? 0)} lotes · ok{' '}
            {String(stats.importTotals.imported_records ?? 0)} · cola{' '}
            {String(stats.importTotals.queued ?? 0)}
          </span>
          <span>
            Exports: {String(stats.exportTotals.jobs ?? 0)} jobs · completados{' '}
            {String(stats.exportTotals.completed ?? 0)}
          </span>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Últimos imports</p>
          {stats.imports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin lotes.</p>
          ) : (
            <ul className="space-y-1">
              {stats.imports.slice(0, 8).map((row) => (
                <li key={String(row.id)} className="flex flex-wrap items-center gap-2 border-b py-1">
                  <span className="font-medium">{String(row.import_type)}</span>
                  <Badge variant="default">{String(row.status)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {String(row.created_at ?? '')} · importados {String(row.imported_records ?? 0)} ·
                    fallidos {String(row.failed_records ?? 0)}
                    {row.idempotency_mode && row.idempotency_mode !== 'off'
                      ? ` · idemp ${String(row.idempotency_mode)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <p className="font-medium">Últimos exports</p>
          {stats.exports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin jobs.</p>
          ) : (
            <ul className="space-y-1">
              {stats.exports.slice(0, 8).map((row) => (
                <li key={String(row.id)} className="flex flex-wrap items-center gap-2 border-b py-1">
                  <span className="font-medium">
                    {String(row.export_type)} · {String(row.format)}
                  </span>
                  <Badge variant="default">{String(row.status)}</Badge>
                  <span className="text-xs text-muted-foreground">{String(row.created_at ?? '')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
