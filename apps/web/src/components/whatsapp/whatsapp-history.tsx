'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  WHATSAPP_RELATED_TYPE_LABELS,
  WHATSAPP_TEMPLATE_LABELS,
  formatDashboardDateTime,
  type PaginatedResult,
  type WhatsAppMessageListRow,
  type WhatsAppRelatedType,
  type WhatsAppTemplateKey,
} from '@sincvete/shared';

interface WhatsAppHistoryProps {
  data: PaginatedResult<WhatsAppMessageListRow>;
  initialSearch?: string;
}

export function WhatsAppHistory({ data, initialSearch = '' }: WhatsAppHistoryProps) {
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

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Historial</h2>
        <p className="text-sm text-muted-foreground">
          Mensajes abiertos hacia WhatsApp · toda la organización
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por tutor, teléfono o texto..."
          className="pl-9"
        />
      </div>

      {data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {initialSearch
            ? 'No hay mensajes con esa búsqueda.'
            : 'Todavía no hay mensajes registrados.'}
        </p>
      ) : (
        <div className="space-y-3">
          {data.data.map((row) => (
            <div key={row.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/propietarios/${row.owner_id}`} className="font-medium text-primary hover:underline">
                  {row.owner_full_name}
                </Link>
                {row.patient_name && (
                  <span className="text-muted-foreground">· {row.patient_name}</span>
                )}
                <Badge>
                  {WHATSAPP_TEMPLATE_LABELS[row.template_key as WhatsAppTemplateKey] ??
                    row.template_key}
                </Badge>
                <Badge variant="default">
                  {WHATSAPP_RELATED_TYPE_LABELS[row.related_type as WhatsAppRelatedType] ??
                    row.related_type}
                </Badge>
              </div>
              <p className="text-sm">{row.body}</p>
              <p className="text-xs text-muted-foreground">
                {row.phone_e164} · {formatDashboardDateTime(row.created_at)}
                {row.sent_by_name ? ` · ${row.sent_by_name}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => goToPage(data.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {data.page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.totalPages}
            onClick={() => goToPage(data.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
