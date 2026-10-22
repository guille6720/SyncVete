'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  CLINICAL_IMAGE_KINDS,
  CLINICAL_IMAGE_KIND_LABELS,
  CLINICAL_IMAGE_KIND_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  isClinicalImagePreviewable,
  type ClinicalImageListRow,
  type PaginatedResult,
} from '@sincvete/shared';

interface ClinicalImagesGalleryProps {
  data: PaginatedResult<ClinicalImageListRow>;
  canWrite: boolean;
  initialSearch?: string;
  initialKind?: string;
  patientId?: string;
}

export function ClinicalImagesGallery({
  data,
  canWrite,
  initialSearch = '',
  initialKind = '',
  patientId,
}: ClinicalImagesGalleryProps) {
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

  const setKind = (kind: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (kind) params.set('kind', kind);
    else params.delete('kind');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const newHref = patientId ? `/imagenes/nueva?patientId=${patientId}` : '/imagenes/nueva';

  return (
    <div className="space-y-4" data-tour="imagenes-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Galería</h2>
          <p className="text-sm text-muted-foreground">Fotos, estudios y documentos del paciente</p>
        </div>
        {canWrite && (
          <div data-tour="imagenes-new">
            <Button asChild>
              <Link href={newHref}>
                <Plus className="mr-2 h-4 w-4" />
                Subir
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1" data-tour="imagenes-search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente, título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={initialKind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="">Todos los tipos</option>
          {CLINICAL_IMAGE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {CLINICAL_IMAGE_KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No hay imágenes en la galería.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href={newHref}>Subir la primera</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.data.map((image) => (
              <Link
                key={image.id}
                href={`/imagenes/${image.id}`}
                className="overflow-hidden rounded-lg border transition-colors hover:border-primary/40"
              >
                <div className="flex aspect-video items-center justify-center bg-muted">
                  {image.signed_url && isClinicalImagePreviewable(image.mime_type) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.signed_url}
                      alt={image.title || image.original_name || 'Imagen clínica'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">
                      {image.title || image.original_name || 'Sin título'}
                    </p>
                    <Badge variant={CLINICAL_IMAGE_KIND_VARIANT[image.kind]}>
                      {CLINICAL_IMAGE_KIND_LABELS[image.kind]}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {SPECIES_EMOJI[image.patient_species]} {image.patient_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatClinicalEntryDateTime(image.taken_at)}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} archivo{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
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
