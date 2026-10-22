'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoney, paidThisMonthLiquidacionesHref, type SettlementsSummary } from '@sincvete/shared';

interface SettlementsSummaryProps {
  summary: SettlementsSummary;
}

export function SettlementsSummaryPanel({ summary }: SettlementsSummaryProps) {
  const currency = summary.currency;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="En borrador / revisión"
        value={String(summary.pendingReviewCount)}
        href="/liquidaciones?pendingReview=1"
        hint="Borrador y pendiente de aprobación"
      />
      <SummaryCard
        label="Aprobadas con saldo"
        value={String(summary.approvedUnpaidCount)}
        href="/liquidaciones?unpaid=1"
        hint="Listas para pagar"
      />
      <SummaryCard
        label="Saldo pendiente"
        value={formatMoney(summary.totalBalanceDue, currency)}
        href={summary.totalBalanceDue > 0 ? '/liquidaciones?unpaid=1' : undefined}
        hint="Total por pagar"
      />
      <SummaryCard
        label="Pagado este mes"
        value={formatMoney(summary.paidThisMonth, currency)}
        href={paidThisMonthLiquidacionesHref()}
        hint="Pagos registrados este mes (por fecha de pago)"
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  hint: string;
}) {
  const content = (
    <Card className={href ? 'transition-colors hover:bg-muted/30' : undefined}>
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
