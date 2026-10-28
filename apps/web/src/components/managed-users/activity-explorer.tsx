'use client';

import { useState, useTransition } from 'react';
import {
  ACTIVITY_MODULES,
  MANAGED_USER_AUDIT_ACTION_LABELS,
  type PaginatedResult,
  type UserActivityRow,
} from '@sincvete/shared';
import { listUserActivity } from '@/actions/managed-users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/components/managed-users/shared';

export interface ActivityFilters {
  userId?: string;
  from?: string;
  to?: string;
  action?: string;
  module?: string;
  branchId?: string;
}

interface ActivityExplorerProps {
  initial: PaginatedResult<UserActivityRow>;
  initialFilters?: ActivityFilters;
  /** Fixed user (detail tab); hides the user filter. */
  fixedUserId?: string;
  users?: Array<{ userId: string; fullName: string }>;
  branches?: Array<{ id: string; name: string }>;
}

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'create', label: 'Creación' },
  { value: 'update', label: 'Modificación' },
  { value: 'delete', label: 'Eliminación' },
  ...Object.entries(MANAGED_USER_AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

function detailSummary(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const parts: string[] = [];
  const removed = details.permissions_removed;
  const added = details.permissions_added;
  if (Array.isArray(removed) && removed.length) parts.push(`Quitados: ${removed.join(', ')}`);
  if (Array.isArray(added) && added.length) parts.push(`Restituidos: ${added.join(', ')}`);
  if (typeof details.from === 'string' && typeof details.to === 'string') {
    parts.push(`${details.from} → ${details.to}`);
  }
  if (typeof details.email === 'string') parts.push(details.email);
  if (typeof details.reason === 'string' && details.reason) parts.push(`Motivo: ${details.reason}`);
  return parts.length ? parts.join(' · ') : null;
}

export function ActivityExplorer({
  initial,
  initialFilters = {},
  fixedUserId,
  users = [],
  branches = [],
}: ActivityExplorerProps) {
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState<ActivityFilters>(initialFilters);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (next: ActivityFilters, page: number) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await listUserActivity({
          userId: fixedUserId ?? (next.userId || undefined),
          from: next.from || undefined,
          to: next.to || undefined,
          action: next.action || undefined,
          module: next.module || undefined,
          branchId: next.branchId || undefined,
          page,
          pageSize: 25,
        });
        setData(result);
      } catch {
        setError('No se pudo cargar la actividad.');
      }
    });
  };

  const update = (patch: Partial<ActivityFilters>) => setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          load(filters, 1);
        }}
      >
        {!fixedUserId ? (
          <div className="space-y-1">
            <Label htmlFor="act-user" className="text-xs">Usuario</Label>
            <Select id="act-user" value={filters.userId ?? ''} onChange={(e) => update({ userId: e.target.value })}>
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="act-from" className="text-xs">Desde</Label>
          <Input id="act-from" type="date" value={filters.from ?? ''} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="act-to" className="text-xs">Hasta</Label>
          <Input id="act-to" type="date" value={filters.to ?? ''} onChange={(e) => update({ to: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="act-action" className="text-xs">Acción</Label>
          <Select id="act-action" value={filters.action ?? ''} onChange={(e) => update({ action: e.target.value })}>
            <option value="">Todas</option>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="act-module" className="text-xs">Módulo</Label>
          <Select id="act-module" value={filters.module ?? ''} onChange={(e) => update({ module: e.target.value })}>
            <option value="">Todos</option>
            {ACTIVITY_MODULES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        {branches.length > 1 ? (
          <div className="space-y-1">
            <Label htmlFor="act-branch" className="text-xs">Sucursal</Label>
            <Select id="act-branch" value={filters.branchId ?? ''} onChange={(e) => update({ branchId: e.target.value })}>
              <option value="">Todas</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <Button type="submit" isPending={pending} className="w-full">
            Filtrar
          </Button>
        </div>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay actividad para los filtros elegidos.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {data.data.map((row) => {
            const extra = detailSummary(row.details);
            return (
              <li key={row.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p>
                    {!fixedUserId ? <span className="font-medium">{row.userName ?? 'Sistema'} · </span> : null}
                    {row.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.module}
                    {row.branchName ? ` · ${row.branchName}` : ''}
                    {extra ? ` · ${extra}` : ''}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={row.createdAt}>
                  {formatDateTime(row.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {data.page} de {data.totalPages} · {data.total} eventos
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={data.page <= 1 || pending}
              onClick={() => load(filters, data.page - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={data.page >= data.totalPages || pending}
              onClick={() => load(filters, data.page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
