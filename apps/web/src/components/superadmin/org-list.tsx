'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { COMMERCIAL_PLAN_KEYS, buildPaginatedResult } from '@sincvete/shared';
import type { SuperadminOrgRecommendationRow } from '@/lib/plan-recommendations';
import type { RecommendationDashboardSummary } from '@/lib/plan-recommendations';
import { exportSuperadminRecommendationsCsv } from '@/actions/superadmin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function statusVariant(status: SuperadminOrgRecommendationRow['status']) {
  if (status === 'active') return 'success' as const;
  if (status === 'trialing') return 'warning' as const;
  if (status === 'cancelled' || status === 'expired' || status === 'past_due') {
    return 'destructive' as const;
  }
  return 'default' as const;
}

function planBadge(planKey: string | null, planName: string | null) {
  if (!planKey) return <span className="text-muted-foreground">—</span>;
  if (planKey === COMMERCIAL_PLAN_KEYS.LEGACY) {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <Badge variant="destructive">{planName ?? 'Legacy'}</Badge>
        <span className="text-[10px] text-muted-foreground">Internal / Migration</span>
      </span>
    );
  }
  const variant =
    planKey === 'premium' || planKey === 'enterprise'
      ? ('success' as const)
      : planKey === 'trial'
        ? ('warning' as const)
        : ('default' as const);
  return <Badge variant={variant}>{planName ?? planKey}</Badge>;
}

function upgradeBadge(row: SuperadminOrgRecommendationRow) {
  const rec = row.recommendation;
  if (rec.upgradeStatus === 'legacy_review') {
    return <Badge variant="destructive">Needs commercial review</Badge>;
  }
  if (rec.upgradeStatus === 'dismissed') {
    return <Badge variant="default">Dismissed</Badge>;
  }
  if (rec.upgradeStatus === 'reviewed') {
    return <Badge variant="default">Reviewed</Badge>;
  }
  if (rec.upgradeStatus === 'trial_conversion' && rec.recommendedPlan) {
    return <Badge variant="warning">Trial → {rec.recommendedPlan}</Badge>;
  }
  if (rec.shouldRecommendUpgrade && rec.recommendedPlan) {
    return <Badge variant="warning">Upgrade recommended</Badge>;
  }
  if (rec.upgradeStatus === 'limit_reached') {
    return <Badge variant="destructive">Limit reached</Badge>;
  }
  if (rec.upgradeStatus === 'near_limit') {
    return <Badge variant="warning">Near limit</Badge>;
  }
  return <span className="text-muted-foreground">—</span>;
}

export function SuperadminOrgList({
  rows,
  total,
  page,
  pageSize,
  initialSearch,
  initialPlanKey = '',
  initialStatus = '',
  initialRecommendedPlan = '',
  initialUpgradeFilter = '',
  initialSort = '',
}: {
  rows: SuperadminOrgRecommendationRow[];
  total: number;
  page: number;
  pageSize: number;
  initialSearch: string;
  initialPlanKey?: string;
  initialStatus?: string;
  initialRecommendedPlan?: string;
  initialUpgradeFilter?: string;
  initialSort?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [planKey, setPlanKey] = useState(initialPlanKey);
  const [status, setStatus] = useState(initialStatus);
  const [recommendedPlan, setRecommendedPlan] = useState(initialRecommendedPlan);
  const [upgradeFilter, setUpgradeFilter] = useState(initialUpgradeFilter);
  const [sort, setSort] = useState(initialSort);
  const [pending, startTransition] = useTransition();
  const [exportPending, runExport] = usePendingAction();
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const data = buildPaginatedResult(rows, total, page, pageSize);

  function applySearch(nextPage = 1) {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (planKey) params.set('plan', planKey);
    if (status) params.set('status', status);
    if (recommendedPlan) params.set('recommended', recommendedPlan);
    if (upgradeFilter) params.set('upgrade', upgradeFilter);
    if (sort) params.set('sort', sort);
    if (nextPage > 1) params.set('page', String(nextPage));
    startTransition(() => {
      router.push(params.size ? `/superadmin?${params.toString()}` : '/superadmin');
    });
  }

  async function downloadCsv() {
    setExportMessage(null);
    const form = new FormData();
    if (search.trim()) form.set('search', search.trim());
    if (planKey) form.set('plan', planKey);
    if (status) form.set('status', status);
    if (recommendedPlan) form.set('recommended', recommendedPlan);
    if (upgradeFilter) form.set('upgrade', upgradeFilter);
    if (sort) form.set('sort', sort);
    const result = await runExport(() => exportSuperadminRecommendationsCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setExportMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-recomendaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportMessage(`${result.data.rowCount} filas exportadas`);
  }

  return (
    <div className={`space-y-4 ${pending ? 'opacity-70' : ''}`}>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          applySearch(1);
        }}
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o slug"
        />
        <Select value={planKey} onChange={(event) => setPlanKey(event.target.value)} aria-label="Plan">
          <option value="">Todos los planes</option>
          {Object.values(COMMERCIAL_PLAN_KEYS).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="trialing">trial</option>
          <option value="active">activa</option>
          <option value="past_due">pago pendiente</option>
          <option value="expired">vencida</option>
          <option value="cancelled">cancelada</option>
        </Select>
        <Select
          value={recommendedPlan}
          onChange={(event) => setRecommendedPlan(event.target.value)}
          aria-label="Plan recomendado"
        >
          <option value="">Rec. cualquiera</option>
          <option value="pro">→ Pro</option>
          <option value="premium">→ Premium</option>
          <option value="enterprise">→ Enterprise</option>
        </Select>
        <Select
          value={upgradeFilter}
          onChange={(event) => setUpgradeFilter(event.target.value)}
          aria-label="Filtro upgrade"
        >
          <option value="">Sin filtro upgrade</option>
          <option value="upgrade_recommended">Upgrade recommended</option>
          <option value="stale">Sin movimiento (stale)</option>
          <option value="closed_outcome">Cierre comercial</option>
          <option value="trial">Trial</option>
          <option value="legacy">Legacy</option>
          <option value="dismissed">Dismissed</option>
          <option value="inactive">Inactive subscription</option>
        </Select>
        <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Orden">
          <option value="">Orden: nombre</option>
          <option value="usage_desc">Mayor uso (pacientes)</option>
          <option value="recommended_recent">Rec. reciente</option>
        </Select>
        <Button type="submit">Buscar</Button>
        <Button
          type="button"
          variant="outline"
          disabled={exportPending}
          onClick={() => void downloadCsv()}
        >
          Exportar CSV
        </Button>
        {exportMessage ? (
          <span className="text-sm text-muted-foreground">{exportMessage}</span>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Clinic</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Current plan</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Users</th>
              <th className="px-3 py-2 font-medium">Branches</th>
              <th className="px-3 py-2 font-medium">Patients</th>
              <th className="px-3 py-2 font-medium">Usage</th>
              <th className="px-3 py-2 font-medium">Recommended</th>
              <th className="px-3 py-2 font-medium">Upgrade</th>
            </tr>
          </thead>
          <tbody>
            {data.data.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={10}>
                  No hay organizaciones todavía.
                </td>
              </tr>
            ) : (
              data.data.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      href={`/superadmin/organizaciones/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{row.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.ownerName ?? '—'}</td>
                  <td className="px-3 py-2">{planBadge(row.planKey, row.planName)}</td>
                  <td className="px-3 py-2">
                    {row.status ? (
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    ) : (
                      'sin suscripción'
                    )}
                  </td>
                  <td className="px-3 py-2">{row.usersUsed}</td>
                  <td className="px-3 py-2">{row.branchesUsed}</td>
                  <td className="px-3 py-2">{row.patientsUsed}</td>
                  <td className="px-3 py-2">
                    {Math.round(Math.min(row.recommendation.usageLevel, 1) * 100)}%
                  </td>
                  <td className="px-3 py-2">
                    {row.recommendation.recommendedPlan ? (
                      <Badge variant="warning">{row.recommendation.recommendedPlan}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">{upgradeBadge(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {data.total} organizaciones · página {data.page} de {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => applySearch(data.page - 1)}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={data.page >= data.totalPages}
              onClick={() => applySearch(data.page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RecommendationSummaryCards({
  summary,
}: {
  summary: RecommendationDashboardSummary;
}) {
  const cards = [
    { label: 'Upgrade recommendations', value: summary.upgradeRecommended },
    { label: 'Basic → Pro', value: summary.basicToPro },
    { label: 'Pro → Premium', value: summary.proToPremium },
    { label: 'Premium → Enterprise', value: summary.premiumToEnterprise },
    { label: 'Near limit', value: summary.nearLimit },
    { label: 'At limit', value: summary.atLimit },
    { label: 'Legacy review', value: summary.legacyReview },
    { label: 'Trial conversion', value: summary.trialConversion },
    { label: 'Revisadas', value: summary.reviewed ?? 0 },
    { label: 'Dismiss Superadmin', value: summary.dismissed ?? 0 },
    { label: 'Aceptadas', value: summary.accepted ?? 0 },
    { label: 'Dismiss clínica (activas)', value: summary.clinicDismissedActive ?? 0 },
    { label: 'Congeladas', value: summary.frozen ?? 0 },
    { label: 'Follow-ups abiertos', value: summary.followUpsOpen ?? 0 },
    { label: 'Follow-ups vencidos', value: summary.followUpsOverdue ?? 0 },
    { label: 'Sin responsable', value: summary.unassignedRecommended ?? 0 },
    { label: 'Asignadas', value: summary.assignedOpen ?? 0 },
    { label: 'Asignadas a mí', value: summary.assignedToMe ?? 0 },
    { label: 'Ganadas', value: summary.outcomeWon ?? 0 },
    { label: 'Perdidas', value: summary.outcomeLost ?? 0 },
    { label: 'Diferidas', value: summary.outcomeDeferred ?? 0 },
    { label: 'No encaja', value: summary.outcomeNotAFit ?? 0 },
    { label: 'Sin movimiento (stale)', value: summary.staleOpen ?? 0 },
    { label: 'Sin contacto', value: summary.neverContactedOpen ?? 0 },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-card px-3 py-3">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="text-2xl font-semibold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
