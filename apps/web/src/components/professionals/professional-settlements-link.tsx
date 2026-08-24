import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_VARIANT,
  formatMoney,
  type ProfessionalSettlement,
} from '@sincvete/shared';
import { Badge } from '@/components/ui/badge';

interface ProfessionalSettlementsLinkProps {
  professionalId: string;
  recentSettlements: ProfessionalSettlement[];
  currency?: string;
}

export function ProfessionalSettlementsLink({
  professionalId,
  recentSettlements,
  currency = 'ARS',
}: ProfessionalSettlementsLinkProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Liquidaciones</CardTitle>
          <CardDescription>Historial y saldos de compensación</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/liquidaciones?professionalId=${professionalId}`}>Ver todas</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {recentSettlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin liquidaciones registradas.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {recentSettlements.map((settlement) => (
              <li key={settlement.id}>
                <Link
                  href={`/liquidaciones/${settlement.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <span>
                    {settlement.period_start} → {settlement.period_end}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant={SETTLEMENT_STATUS_VARIANT[settlement.status]}>
                      {SETTLEMENT_STATUS_LABELS[settlement.status]}
                    </Badge>
                    <span className="font-medium">
                      {formatMoney(settlement.total_amount, settlement.currency ?? currency)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
