import { notFound, redirect } from 'next/navigation';
import { getClinicalImage, canReadImages, canManageImages } from '@/actions/images';
import {
  canReadProfessionalSettlements,
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
  const [image, canWrite, canReadSettlements] = await Promise.all([
    getClinicalImage(id),
    canManageImages(),
    canReadProfessionalSettlements(),
  ]);

  if (!image) notFound();

  const procedureKinds = new Set(['radiografia', 'ecografia', 'laboratorio']);
  const settlementClaim =
    canReadSettlements && procedureKinds.has(image.kind)
      ? await getSettlementClaimForSource('procedure', image.id)
      : null;

  return (
    <ClinicalImageDetail image={image} canWrite={canWrite} settlementClaim={settlementClaim} />
  );
}
