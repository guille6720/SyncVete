import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  INTERCONSULTATION_PRIORITY_LABELS,
  INTERCONSULTATION_STATUS_LABELS,
  formatInterconsultationMoney,
  type InterconsultationPriority,
  type InterconsultationStatus,
} from '@sincvete/shared';
import {
  canReadInterconsultations,
  canWriteInterconsultations,
  getInterconsultationKpis,
  listInterconsultations,
} from '@/actions/interconsultations';
import { listProfessionals } from '@/actions/professionals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function statusVariant(
  status: InterconsultationStatus
): 'default' | 'success' | 'warning' | 'destructive' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'destructive';
  if (status === 'quotes_received' || status === 'approved' || status === 'in_progress') {
    return 'warning';
  }
  return 'default';
}

export default async function InterconsultasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const canRead = await canReadInterconsultations();
  if (!canRead) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const status = typeof params.status === 'string' ? params.status : null;
  const priority = typeof params.priority === 'string' ? params.priority : null;
  const professionalId = typeof params.professionalId === 'string' ? params.professionalId : null;

  const [kpis, list, canWrite, professionals] = await Promise.all([
    getInterconsultationKpis(),
    listInterconsultations({
      status,
      priority,
      professionalId,
      page: 1,
      pageSize: 50,
    }),
    canWriteInterconsultations(),
    listProfessionals().catch(() => []),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interconsultas</h1>
          <p className="text-muted-foreground">
            Solicitudes de opinión, diagnóstico o servicio a otros profesionales
          </p>
        </div>
        {canWrite ? (
          <Button asChild>
            <Link href="/interconsultas/nueva">Nueva interconsulta</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Abiertas', value: kpis.open },
          { label: 'Esperando respuesta', value: kpis.waitingResponse },
          { label: 'Presupuestos recibidos', value: kpis.quotesReceived },
          { label: 'Pendientes de cobro', value: kpis.pendingBilling },
          { label: 'Pendientes de liquidación', value: kpis.pendingSettlement },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Estado</span>
          <select
            name="status"
            defaultValue={status ?? ''}
            className="flex h-10 w-44 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(INTERCONSULTATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Prioridad</span>
          <select
            name="priority"
            defaultValue={priority ?? ''}
            className="flex h-10 w-36 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todas</option>
            {Object.entries(INTERCONSULTATION_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Profesional</span>
          <select
            name="professionalId"
            defaultValue={professionalId ?? ''}
            className="flex h-10 w-56 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos</option>
            {professionals.map((pro) => (
              <option key={pro.id} value={pro.id}>
                {pro.first_name} {pro.last_name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {list.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">No hay interconsultas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Creá una solicitud para pedir opinión o servicio a otros profesionales.
          </p>
          {canWrite ? (
            <Button asChild className="mt-4">
              <Link href="/interconsultas/nueva">Nueva interconsulta</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Paciente</th>
                <th className="px-3 py-2 font-medium">Profesionales</th>
                <th className="px-3 py-2 font-medium">Asunto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.patientName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{row.ownerName}</div>
                  </td>
                  <td className="px-3 py-2">
                    {row.professionalNames.length
                      ? row.professionalNames.join(', ')
                      : 'Sin asignar'}
                  </td>
                  <td className="px-3 py-2">
                    <div>{row.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {INTERCONSULTATION_PRIORITY_LABELS[row.priority as InterconsultationPriority]}
                      {row.quoteCount > 0 ? ` · ${row.quoteCount} presup.` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(row.status)}>
                      {INTERCONSULTATION_STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatInterconsultationMoney(row.clientFinalAmount, row.currency)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/interconsultas/${row.id}`}>Ver</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
