'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SettlementsBulkToolbar } from '@/components/professionals/settlements-bulk-toolbar';
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_VARIANT,
  formatMoney,
  type PaginatedResult,
  type Professional,
  type ProfessionalSettlement,
  type SettlementStatus,
} from '@sincvete/shared';

interface BranchOption {
  id: string;
  name: string;
}

interface SettlementsHistoryProps {
  data: PaginatedResult<ProfessionalSettlement>;
  professionals: Professional[];
  branches?: BranchOption[];
  initialStatus?: string;
  initialProfessionalId?: string;
  initialPeriodStart?: string;
  initialPeriodEnd?: string;
  initialBranchId?: string;
  currency?: string;
  canBulkApprove?: boolean;
  canBulkSubmit?: boolean;
  canBulkPay?: boolean;
  readOnly?: boolean;
  detailBasePath?: string;
}

function professionalLabel(professionals: Professional[], id: string) {
  const match = professionals.find((p) => p.id === id);
  return match ? `${match.last_name}, ${match.first_name}` : 'Profesional';
}

export function SettlementsHistory({
  data,
  professionals,
  branches = [],
  initialStatus = '',
  initialProfessionalId = '',
  initialPeriodStart = '',
  initialPeriodEnd = '',
  initialBranchId = '',
  currency = 'ARS',
  canBulkApprove = false,
  canBulkSubmit = false,
  canBulkPay = false,
  readOnly = false,
  detailBasePath = '/liquidaciones',
}: SettlementsHistoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    params.delete('page');
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  const selectableIds = useMemo(
    () =>
      data.data
        .filter((settlement) => {
          if (canBulkSubmit && settlement.status === 'draft') return true;
          if (canBulkApprove && (settlement.status === 'draft' || settlement.status === 'review')) {
            return true;
          }
          if (
            canBulkPay &&
            (settlement.status === 'approved' || settlement.status === 'partially_paid') &&
            settlement.balance_due > 0
          ) {
            return true;
          }
          return false;
        })
        .map((settlement) => settlement.id),
    [canBulkApprove, canBulkPay, canBulkSubmit, data.data]
  );

  const selectedSettlements = useMemo(
    () => data.data.filter((row) => selectedIds.includes(row.id)),
    [data.data, selectedIds]
  );

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)
    );
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? selectableIds : []);
  };

  const showBulk =
    !readOnly && (canBulkApprove || canBulkSubmit || canBulkPay) && selectableIds.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{readOnly ? 'Mis liquidaciones' : 'Historial'}</h2>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? 'Consultá el estado y detalle de tus liquidaciones'
            : 'Liquidaciones calculadas y pagadas'}
        </p>
      </div>

      {!readOnly ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Select
            value={initialProfessionalId}
            onChange={(e) => updateParams({ professionalId: e.target.value || null })}
            className="w-full"
          >
            <option value="">Todos los profesionales</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.last_name}, {professional.first_name}
              </option>
            ))}
          </Select>
          <Select
            value={initialStatus}
            onChange={(e) => updateParams({ status: e.target.value || null })}
            className="w-full"
          >
            <option value="">Todos los estados</option>
            {SETTLEMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SETTLEMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          {branches.length > 0 ? (
            <Select
              value={initialBranchId}
              onChange={(e) => updateParams({ branchId: e.target.value || null })}
              className="w-full"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Input
            type="date"
            value={initialPeriodStart}
            onChange={(e) => updateParams({ periodStart: e.target.value || null })}
            aria-label="Período desde"
            className="w-full"
          />
          <Input
            type="date"
            value={initialPeriodEnd}
            onChange={(e) => updateParams({ periodEnd: e.target.value || null })}
            aria-label="Período hasta"
            className="w-full"
          />
        </div>
      ) : (
        <Select
          value={initialStatus}
          onChange={(e) => updateParams({ status: e.target.value || null })}
          className="w-full sm:w-56"
        >
          <option value="">Todos los estados</option>
          {SETTLEMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {SETTLEMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      )}

      {showBulk ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.length > 0 && selectedIds.length === selectableIds.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            Seleccionar elegibles
          </label>
          <SettlementsBulkToolbar
            selectedIds={selectedIds}
            selectedSettlements={selectedSettlements}
            professionals={professionals}
            canApprove={canBulkApprove}
            canSubmitForReview={canBulkSubmit}
            canPay={canBulkPay}
            currency={currency}
            onClear={() => setSelectedIds([])}
            onComplete={() => router.refresh()}
          />
        </div>
      ) : null}

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay liquidaciones para los filtros seleccionados.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {data.data.map((settlement) => {
            const isSelectable = selectableIds.includes(settlement.id);
            const status = settlement.status as SettlementStatus;
            return (
              <div
                key={settlement.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {showBulk && isSelectable ? (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedIds.includes(settlement.id)}
                      onChange={(e) => toggleOne(settlement.id, e.target.checked)}
                    />
                  ) : showBulk ? (
                    <span className="mt-1 w-4" />
                  ) : null}
                  <Link href={`${detailBasePath}/${settlement.id}`} className="min-w-0 flex-1">
                    <p className="font-medium">
                      {readOnly
                        ? `${settlement.period_start} → ${settlement.period_end}`
                        : professionalLabel(professionals, settlement.professional_id)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {readOnly
                        ? SETTLEMENT_STATUS_LABELS[status]
                        : `${settlement.period_start} → ${settlement.period_end}`}
                    </p>
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={SETTLEMENT_STATUS_VARIANT[status]}>
                    {SETTLEMENT_STATUS_LABELS[status]}
                  </Badge>
                  <span className="text-sm font-medium">
                    {formatMoney(settlement.total_amount, settlement.currency ?? currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Página {data.page} de {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => goToPage(data.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => goToPage(data.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
