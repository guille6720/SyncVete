'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_VARIANT,
  AUDIT_ENTITY_TYPES,
  AUDIT_LIQUIDACIONES_FAMILY,
  auditEntityLabel,
  formatRelativeTime,
  isAuditAction,
  ROLE_LABELS,
  type AuditMemberOption,
  type AuditLogListRow,
  type PaginatedResult,
} from '@sincvete/shared';

interface AuditLogListProps {
  data: PaginatedResult<AuditLogListRow>;
  members: AuditMemberOption[];
  initialUserId?: string;
  initialSearch?: string;
  initialAction?: string;
  initialEntityType?: string;
  initialFrom?: string;
  initialTo?: string;
}

export function AuditLogList({
  data,
  members,
  initialUserId = '',
  initialSearch = '',
  initialAction = '',
  initialEntityType = '',
  initialFrom = '',
  initialTo = '',
}: AuditLogListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebouncedValue(search);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;

    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) params.set('search', debouncedSearch);
    else params.delete('search');
    params.delete('page');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [debouncedSearch, pathname, router, searchParams]);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
        <Select
          aria-label="Integrante de la clínica"
          value={initialUserId}
          onChange={(e) => updateParam('userId', e.target.value)}
          className="w-full lg:max-w-md lg:flex-1"
        >
          <option value="">Todos los integrantes de la clínica</option>
          {initialUserId && !members.some((member) => member.userId === initialUserId) && (
            <option value={initialUserId}>Integrante no disponible</option>
          )}
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.fullName} · {member.roles.map((role) => ROLE_LABELS[role]).join(', ')}
              {member.isActive ? '' : ' (inactivo)'}
            </option>
          ))}
        </Select>
        <Select
          value={initialAction}
          onChange={(e) => updateParam('action', e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">Todas las acciones</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABELS[action]}
            </option>
          ))}
        </Select>
        <Select
          value={initialEntityType}
          onChange={(e) => updateParam('entityType', e.target.value)}
          className="w-full sm:w-56"
        >
          <option value="">Todas las entidades</option>
          <option value={AUDIT_LIQUIDACIONES_FAMILY}>
            {auditEntityLabel(AUDIT_LIQUIDACIONES_FAMILY)}
          </option>
          {AUDIT_ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {auditEntityLabel(type)}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={initialFrom}
          onChange={(e) => updateParam('from', e.target.value)}
          className="w-full sm:w-40"
        />
        <Input
          type="date"
          value={initialTo}
          onChange={(e) => updateParam('to', e.target.value)}
          className="w-full sm:w-40"
        />
      </div>

      <div className="relative max-w-md">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Buscar en los eventos de auditoría"
          placeholder="Buscar en los eventos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No hay eventos en este período.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {data.data.map((item) => {
              const action = isAuditAction(item.action) ? item.action : 'update';
              return (
                <li key={item.id}>
                  <Link
                    href={`/auditoria/${item.id}`}
                    className="flex w-full flex-col gap-1 px-4 py-3 hover:bg-accent/60"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.summary}</p>
                      <Badge variant={AUDIT_ACTION_VARIANT[action]}>
                        {AUDIT_ACTION_LABELS[action]}
                      </Badge>
                      <Badge>{auditEntityLabel(item.entity_type)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.user_full_name || 'Sistema'}
                      {item.branch_name ? ` · ${item.branch_name}` : ''}
                      {' · '}
                      {formatRelativeTime(item.created_at)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} evento{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
                {data.totalPages}
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
        </>
      )}
    </div>
  );
}
