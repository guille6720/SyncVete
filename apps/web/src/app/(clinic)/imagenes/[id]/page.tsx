import { notFound, redirect } from 'next/navigation';
import { getClinicalImage, canReadImages, canManageImages } from '@/actions/images';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { ClinicalImageDetail } from '@/components/images/clinical-image-detail';

interface ImagenDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ImagenDetailPage({ params }: ImagenDetailPageProps) {
  const canRead = await canReadImages();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [image, canWrite, settlementAccess] = await Promise.all([
    getClinicalImage(id),
    canManageImages(),
    canReadSettlementSourceClaims(),
  ]);

  if (!image) notFound();

  const procedureKinds = new Set(['radiografia', 'ecografia', 'laboratorio']);
  const settlementClaim =
    settlementAccess && procedureKinds.has(image.kind)
      ? await getSettlementClaimForSource('procedure', image.id)
      : null;
  const settlementDetailBasePath =
    settlementAccess === 'own' ? '/liquidaciones/mis-liquidaciones' : '/liquidaciones';

  return (
    <ClinicalImageDetail
      image={image}
      canWrite={canWrite}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
    />
  );
}
