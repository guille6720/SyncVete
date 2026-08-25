import Link from 'next/link';
import {
  SETTLEMENT_ITEM_SOURCE_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  type SettlementDuplicateClaimWarning,
} from '@sincvete/shared';

interface SettlementDuplicateWarningsProps {
  warnings: SettlementDuplicateClaimWarning[];
}

export function SettlementDuplicateWarnings({ warnings }: SettlementDuplicateWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <p className="font-medium text-amber-900 dark:text-amber-100">
        Fuentes ya liquidadas en otra liquidación
      </p>
      <p className="mt-1 text-muted-foreground">
        Si aprobás, el sistema rechazará las líneas en conflicto. Revisá o recalculá antes de
        aprobar.
      </p>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning) => (
          <li key={`${warning.sourceId}-${warning.conflictingSettlementId}`}>
            <span className="font-medium">{warning.itemDescription}</span>
            <span className="text-muted-foreground">
              {' '}
              ({SETTLEMENT_ITEM_SOURCE_TYPE_LABELS[warning.sourceType]}) · conflicto con{' '}
              {SETTLEMENT_STATUS_LABELS[warning.conflictingStatus].toLowerCase()}{' '}
              {warning.conflictingPeriodStart} → {warning.conflictingPeriodEnd}
            </span>{' '}
            <Link
              href={`/liquidaciones/${warning.conflictingSettlementId}`}
              className="text-primary hover:underline"
            >
              Ver liquidación
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
