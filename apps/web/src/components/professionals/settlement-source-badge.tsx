import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_VARIANT,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';

interface SettlementSourceBadgeProps {
  claim: SettlementSourceClaimInfo;
  compact?: boolean;
  detailHref?: string;
}

export function SettlementSourceBadge({
  claim,
  compact = false,
  detailHref,
}: SettlementSourceBadgeProps) {
  const status = claim.status as keyof typeof SETTLEMENT_STATUS_LABELS;
  const href = detailHref ?? `/liquidaciones/${claim.settlementId}`;

  if (compact) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Incluida en liquidación{' '}
        <Badge variant={SETTLEMENT_STATUS_VARIANT[status] ?? 'default'} className="mx-1">
          {SETTLEMENT_STATUS_LABELS[status] ?? claim.status}
        </Badge>
        <Link href={href} className="text-primary hover:underline">
          Ver liquidación
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-violet-200/70 bg-violet-50/50 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950/30">
      <span className="text-muted-foreground">Incluida en liquidación</span>
      <Badge variant={SETTLEMENT_STATUS_VARIANT[status] ?? 'default'}>
        {SETTLEMENT_STATUS_LABELS[status] ?? claim.status}
      </Badge>
      <span className="text-muted-foreground">
        {claim.periodStart} → {claim.periodEnd}
      </span>
      <Link href={href} className="text-primary hover:underline">
        Ver liquidación
      </Link>
    </div>
  );
}
