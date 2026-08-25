import { notFound, redirect } from 'next/navigation';
import { getPrescription, canReadPharmacy, canManagePharmacy } from '@/actions/pharmacy';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { buildSettlementDetailBasePath } from '@sincvete/shared';
import { PrescriptionDetail } from '@/components/pharmacy/prescription-detail';
import { resolveListHref } from '@/lib/list-return';

interface FarmaciaDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}

export default async function FarmaciaDetailPage({
  params,
  searchParams,
}: FarmaciaDetailPageProps) {
  const canRead = await canReadPharmacy();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const query = await searchParams;
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
  const settlementDetailBasePath = buildSettlementDetailBasePath(settlementAccess);

  return (
    <PrescriptionDetail
      prescription={data.prescription}
      items={data.items}
      canWrite={canWrite}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
      listHref={resolveListHref('/farmacia', query.return)}
    />
  );
}
