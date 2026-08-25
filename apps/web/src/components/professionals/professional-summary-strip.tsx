import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatMoney, type ProfessionalSettlementSummary } from '@sincvete/shared';

interface ProfessionalSummaryStripProps {
  professionalId: string;
  summary: ProfessionalSettlementSummary;
  currency?: string;
  canCalculate?: boolean;
}

export function ProfessionalSummaryStrip({
  professionalId,
  summary,
  currency = 'ARS',
  canCalculate = false,
}: ProfessionalSummaryStripProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Saldo pendiente"
          value={formatMoney(summary.openBalance, currency)}
          href={
            summary.openBalance > 0
              ? `/liquidaciones?professionalId=${professionalId}&unpaid=1`
              : undefined
          }
        />
        <SummaryCard
          label="En borrador / revisión"
          value={String(summary.pendingSettlementCount)}
          href={
            summary.pendingSettlementCount > 0
              ? `/liquidaciones?professionalId=${professionalId}&pendingReview=1`
              : undefined
          }
        />
        <SummaryCard
          label="Esquema vigente"
          value={summary.activeSchemeName ?? 'Sin esquema'}
        />
        {canCalculate ? (
          <Card>
            <CardContent className="flex h-full flex-col justify-center px-4 py-3">
              <p className="text-xs text-muted-foreground">Acción rápida</p>
              <Button variant="outline" size="sm" className="mt-2 w-fit" asChild>
                <Link href={`/liquidaciones?professionalId=${professionalId}`}>
                  Calcular liquidación
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <Card className={href ? 'transition-colors hover:bg-muted/30' : undefined}>
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
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
