import { notFound, redirect } from 'next/navigation';
import { getPrescription, canReadPharmacy, canManagePharmacy } from '@/actions/pharmacy';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { PrescriptionDetail } from '@/components/pharmacy/prescription-detail';

interface FarmaciaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function FarmaciaDetailPage({ params }: FarmaciaDetailPageProps) {
  const canRead = await canReadPharmacy();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [data, canWrite, settlementAccess] = await Promise.all([
    getPrescription(id),
    canManagePharmacy(),
    canReadSettlementSourceClaims(),
  ]);

  if (!data) notFound();

  const settlementClaim =
    settlementAccess && data.prescription.status === 'dispensada'
      ? await getSettlementClaimForSource('prescription', data.prescription.id)
      : null;
  const settlementDetailBasePath =
    settlementAccess === 'own' ? '/liquidaciones/mis-liquidaciones' : '/liquidaciones';

  return (
    <PrescriptionDetail
      prescription={data.prescription}
      items={data.items}
      canWrite={canWrite}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
    />
  );
}
