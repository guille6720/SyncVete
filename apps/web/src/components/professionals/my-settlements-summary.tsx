import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoney, type MySettlementsSummary } from '@sincvete/shared';

interface MySettlementsSummaryProps {
  summary: MySettlementsSummary;
}

export function MySettlementsSummaryPanel({ summary }: MySettlementsSummaryProps) {
  const currency = summary.currency;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="Saldo pendiente"
        value={formatMoney(summary.openBalance, currency)}
        hint="Liquidaciones aprobadas sin pagar"
        href={summary.openBalance > 0 ? '/liquidaciones/mis-liquidaciones?unpaid=1' : undefined}
      />
      <SummaryCard
        label="En revisión"
        value={String(summary.pendingReviewCount)}
        hint="Borrador o pendiente de aprobación"
        href={
          summary.pendingReviewCount > 0
            ? '/liquidaciones/mis-liquidaciones?pendingReview=1'
            : undefined
        }
      />
      <SummaryCard
        label="Por cobrar"
        value={String(summary.approvedUnpaidCount)}
        hint="Liquidaciones con saldo"
        href={
          summary.approvedUnpaidCount > 0
            ? '/liquidaciones/mis-liquidaciones?unpaid=1'
            : undefined
        }
      />
      <SummaryCard
        label="Último pago"
        value={
          summary.lastPaymentAmount != null
            ? formatMoney(summary.lastPaymentAmount, currency)
            : '—'
        }
        hint={
          summary.lastPaymentDate
            ? summary.lastPaymentDate.slice(0, 10)
            : 'Sin pagos registrados'
        }
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
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
