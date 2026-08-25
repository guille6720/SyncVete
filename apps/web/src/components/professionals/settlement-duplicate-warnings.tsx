'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SETTLEMENT_ITEM_SOURCE_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  type SettlementDuplicateClaimWarning,
} from '@sincvete/shared';

interface SettlementDuplicateWarningsProps {
  warnings: SettlementDuplicateClaimWarning[];
  canOmit?: boolean;
  omitAction?: (formData: FormData) => void | Promise<void>;
  omitPending?: boolean;
}

export function SettlementDuplicateWarnings({
  warnings,
  canOmit = false,
  omitAction,
  omitPending = false,
}: SettlementDuplicateWarningsProps) {
  if (warnings.length === 0) return null;

  const hard = warnings.filter((row) => row.severity === 'hard');
  const soft = warnings.filter((row) => row.severity === 'soft');

  return (
    <div className="space-y-3">
      {hard.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">
            Fuentes ya liquidadas en otra liquidación
          </p>
          <p className="mt-1 text-muted-foreground">
            La aprobación está bloqueada hasta excluir o recalcular estas líneas.
          </p>
          <WarningList
            warnings={hard}
            canOmit={canOmit}
            omitAction={omitAction}
            omitPending={omitPending}
            showOmit
          />
        </div>
      ) : null}
      {soft.length > 0 ? (
        <div className="rounded-lg border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Fuentes también en otra liquidación abierta
          </p>
          <p className="mt-1 text-muted-foreground">
            Aparecen en borrador o revisión de otro período. No bloquean la aprobación, pero conviene
            revisar para no duplicar el pago.
          </p>
          <WarningList
            warnings={soft}
            canOmit={canOmit}
            omitAction={omitAction}
            omitPending={omitPending}
            showOmit={canOmit}
          />
        </div>
      ) : null}
    </div>
  );
}

function WarningList({
  warnings,
  canOmit,
  omitAction,
  omitPending,
  showOmit,
}: {
  warnings: SettlementDuplicateClaimWarning[];
  canOmit: boolean;
  omitAction?: (formData: FormData) => void | Promise<void>;
  omitPending: boolean;
  showOmit: boolean;
}) {
  return (
    <ul className="mt-3 space-y-3">
      {warnings.map((warning) => (
        <li
          key={`${warning.severity}-${warning.itemId}-${warning.conflictingSettlementId}`}
          className="space-y-2"
        >
          <div>
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
          </div>
          {showOmit && canOmit && omitAction ? (
            <form action={omitAction} className="flex flex-wrap items-end gap-1">
              <input type="hidden" name="itemId" value={warning.itemId} />
              <Input
                name="reason"
                required
                minLength={3}
                maxLength={500}
                defaultValue={
                  warning.severity === 'hard'
                    ? 'Excluida: ya liquidada en otro período'
                    : 'Excluida: duplicada en otra liquidación abierta'
                }
                className="h-8 w-56 text-xs"
              />
              <Button type="submit" variant="outline" size="sm" disabled={omitPending}>
                Excluir
              </Button>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
