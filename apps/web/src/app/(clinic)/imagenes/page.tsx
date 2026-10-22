import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { canManageImages, canReadImages, listClinicalImages } from '@/actions/images';
import { ClinicalImagesGallery } from '@/components/images/clinical-images-gallery';
import { CLINICAL_IMAGE_KINDS, type ClinicalImageKind } from '@sincvete/shared';
import { moduleTourTargets } from '@sincvete/shared';

interface ImagenesPageProps {
  searchParams: Promise<{ page?: string; search?: string; kind?: string; patientId?: string }>;
}

export default async function ImagenesPage({ searchParams }: ImagenesPageProps) {
  const canRead = await canReadImages();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const kindParam = params.kind?.trim() ?? '';
  const kind = CLINICAL_IMAGE_KINDS.includes(kindParam as ClinicalImageKind)
    ? (kindParam as ClinicalImageKind)
    : undefined;

  const [data, canWrite] = await Promise.all([
    listClinicalImages({
      page,
      pageSize: 24,
      search: search || undefined,
      kind,
      patientId: params.patientId || undefined,
    }),
    canManageImages(),
  ]);

  const tour = moduleTourTargets('imagenes');
  return (
    <div className="space-y-8" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">Imágenes</h1>
        <p className="text-muted-foreground">Fotos clínicas, radiografías, ecografías y documentos</p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando galería...</div>}>
        <ClinicalImagesGallery
          data={data}
          canWrite={canWrite}
          initialSearch={search}
          initialKind={kind ?? ''}
          patientId={params.patientId}
        />
      </Suspense>
    </div>
  );
}
