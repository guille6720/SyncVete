'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PROFESSIONAL_RELATIONSHIP_LABELS,
  formatMoney,
  type ProfessionalListRow,
} from '@sincvete/shared';

interface ProfessionalsListProps {
  professionals: ProfessionalListRow[];
  currency?: string;
  canReadCompensation?: boolean;
  canReadSettlements?: boolean;
  canBookAppointments?: boolean;
}

export function ProfessionalsList({
  professionals,
  currency = 'ARS',
  canReadCompensation = false,
  canReadSettlements = false,
  canBookAppointments = false,
}: ProfessionalsListProps) {
  if (professionals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Todavía no hay profesionales registrados.
      </div>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {professionals.map((professional) => (
        <div
          key={professional.id}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        >
          <Link
            href={`/profesionales/${professional.id}`}
            className="min-w-0 flex-1 hover:underline"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {professional.last_name}, {professional.first_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {PROFESSIONAL_RELATIONSHIP_LABELS[professional.relationship_type]}
                {professional.specialty ? ` · ${professional.specialty}` : ''}
              </p>
              {(canReadCompensation || canReadSettlements) && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {canReadCompensation && (
                    <span>
                      Esquema:{' '}
                      {professional.activeSchemeName ? (
                        <span className="text-foreground">{professional.activeSchemeName}</span>
                      ) : (
                        'Sin esquema vigente'
                      )}
                    </span>
                  )}
                  {canReadSettlements && professional.openBalance > 0 ? (
                    <span>
                      Saldo:{' '}
                      <span className="font-medium text-foreground">
                        {formatMoney(professional.openBalance, currency)}
                      </span>
                    </span>
                  ) : null}
                  {canReadSettlements && professional.pendingSettlementCount > 0 ? (
                    <span>{professional.pendingSettlementCount} en borrador/revisión</span>
                  ) : null}
                  {canReadSettlements &&
                  professional.lastPaymentAmount != null &&
                  professional.lastPaymentDate ? (
                    <span>
                      Último pago:{' '}
                      <span className="text-foreground">
                        {formatMoney(professional.lastPaymentAmount, currency)}
                      </span>{' '}
                      ({professional.lastPaymentDate.slice(0, 10)})
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {canBookAppointments && professional.is_active ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/agenda/nueva?assigned=${professional.id}`}>Dar turno</Link>
              </Button>
            ) : null}
            {canReadSettlements && professional.openBalance > 0 ? (
              <Badge variant="warning">{formatMoney(professional.openBalance, currency)}</Badge>
            ) : null}
            <Badge variant={professional.is_active ? 'success' : 'default'}>
              {professional.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
