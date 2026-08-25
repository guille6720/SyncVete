'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';
import {
  formatMoney,
  SETTLEMENT_STATUS_LABELS,
  isSettlementStatus,
  paidThisMonthLiquidacionesHref,
  type SettlementStatus,
  type SettlementsSummary,
} from '@sincvete/shared';
import { Button } from '@/components/ui/button';

interface DashboardSettlementsSnapshotProps {
  summary: SettlementsSummary;
}

const STATUS_BAR_COLORS: Partial<Record<SettlementStatus, string>> = {
  draft: 'bg-slate-400',
  review: 'bg-amber-500',
  approved: 'bg-blue-500',
  partially_paid: 'bg-violet-500',
  paid: 'bg-emerald-500',
  cancelled: 'bg-rose-400',
};

export function DashboardSettlementsSnapshot({ summary }: DashboardSettlementsSnapshotProps) {
  const hasWork =
    summary.pendingReviewCount > 0 ||
    summary.approvedUnpaidCount > 0 ||
    summary.totalBalanceDue > 0;

  const statusTotal = summary.byStatus.reduce((sum, item) => sum + item.count, 0);
  const paidThisMonthHref = paidThisMonthLiquidacionesHref();

  return (
    <section className="rounded-xl border border-violet-200/70 bg-card/95 p-5 text-card-foreground shadow-sm backdrop-blur-sm dark:border-violet-800">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200">
            <Wallet className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Liquidaciones</h2>
            <p className="text-sm text-muted-foreground">
              {hasWork
                ? `${summary.pendingReviewCount} en revisión · ${summary.approvedUnpaidCount} por pagar`
                : 'Sin liquidaciones pendientes'}
            </p>
          </div>
        </div>
        <Button variant="default" size="sm" asChild>
          <Link href="/liquidaciones">Ver liquidaciones</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="En revisión"
          value={String(summary.pendingReviewCount)}
          href="/liquidaciones?pendingReview=1"
        />
        <Metric
          label="Por pagar"
          value={String(summary.approvedUnpaidCount)}
          href="/liquidaciones?unpaid=1"
        />
        <Metric
          label="Saldo pendiente"
          value={formatMoney(summary.totalBalanceDue, summary.currency)}
          href="/liquidaciones?unpaid=1"
        />
        <Metric
          label="Pagado este mes"
          value={formatMoney(summary.paidThisMonth, summary.currency)}
          href={paidThisMonthHref}
        />
      </div>

      {statusTotal > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Distribución por estado
          </p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {summary.byStatus.map((item) => {
              const pct = (item.count / statusTotal) * 100;
              if (pct <= 0) return null;
              const status = isSettlementStatus(item.status) ? item.status : null;
              const barClass = `h-full w-full ${status ? STATUS_BAR_COLORS[status] ?? 'bg-muted-foreground/40' : 'bg-muted-foreground/40'}`;
              const title = `${status ? SETTLEMENT_STATUS_LABELS[status] : item.status}: ${item.count}`;

              if (status) {
                return (
                  <Link
                    key={item.status}
                    href={`/liquidaciones?status=${status}`}
                    className="h-full"
                    style={{ width: `${pct}%` }}
                    title={title}
                  >
                    <div className={barClass} />
                  </Link>
                );
              }

              return (
                <div key={item.status} className="h-full" style={{ width: `${pct}%` }} title={title}>
                  <div className={barClass} />
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {summary.byStatus.map((item) => {
              const status = isSettlementStatus(item.status) ? item.status : null;
              const label = (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${status ? STATUS_BAR_COLORS[status] ?? 'bg-muted-foreground/40' : 'bg-muted-foreground/40'}`}
                  />
                  {status ? SETTLEMENT_STATUS_LABELS[status] : item.status} ({item.count})
                </span>
              );
              return status ? (
                <Link
                  key={item.status}
                  href={`/liquidaciones?status=${status}`}
                  className="transition-colors hover:text-foreground"
                >
                  {label}
                </Link>
              ) : (
                <span key={item.status}>{label}</span>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
