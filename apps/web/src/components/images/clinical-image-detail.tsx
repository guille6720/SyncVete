'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import { deleteClinicalImage } from '@/actions/images';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CLINICAL_IMAGE_KIND_LABELS,
  CLINICAL_IMAGE_KIND_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  formatFileSize,
  isClinicalImagePreviewable,
  type ClinicalImageListRow,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface ClinicalImageDetailProps {
  image: ClinicalImageListRow;
  canWrite: boolean;
  settlementClaim?: SettlementSourceClaimInfo | null;
}

export function ClinicalImageDetail({
  image,
  canWrite,
  settlementClaim = null,
}: ClinicalImageDetailProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('¿Eliminar esta imagen?')) return;
    const result = await deleteClinicalImage(image.id);
    if (result.success) router.push('/imagenes');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/imagenes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a imágenes
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {image.consultation_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${image.consultation_id}`}>Ver consulta</Link>
            </Button>
          )}
          {image.clinical_entry_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${image.clinical_entry_id}`}>Ver en historia</Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      {settlementClaim ? <SettlementSourceBadge claim={settlementClaim} /> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{image.title || image.original_name || 'Imagen clínica'}</CardTitle>
            <Badge variant={CLINICAL_IMAGE_KIND_VARIANT[image.kind]}>
              {CLINICAL_IMAGE_KIND_LABELS[image.kind]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(image.taken_at)}
            {image.uploaded_by_name ? ` · ${image.uploaded_by_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-muted">
            {image.signed_url && isClinicalImagePreviewable(image.mime_type) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.signed_url}
                alt={image.title || image.original_name || 'Imagen clínica'}
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            ) : image.signed_url ? (
              <div className="flex flex-col items-center gap-3 p-10">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <Button asChild>
                  <a href={image.signed_url} target="_blank" rel="noreferrer">
                    Abrir PDF
                  </a>
                </Button>
              </div>
            ) : (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No se pudo generar el enlace de visualización.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Paciente"
              value={
                <Link href={`/pacientes/${image.patient_id}`} className="text-primary hover:underline">
                  {SPECIES_EMOJI[image.patient_species]} {image.patient_name}
                </Link>
              }
            />
            <DetailField
              label="Propietario"
              value={
                <Link href={`/propietarios/${image.owner_id}`} className="text-primary hover:underline">
                  {image.owner_full_name}
                </Link>
              }
            />
            <DetailField label="Archivo" value={image.original_name} />
            <DetailField label="Tamaño" value={formatFileSize(image.file_size)} />
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={image.notes} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{value || '—'}</div>
    </div>
  );
}
