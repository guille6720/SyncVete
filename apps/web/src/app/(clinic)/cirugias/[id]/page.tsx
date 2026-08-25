import { notFound, redirect } from 'next/navigation';
import { getSurgery, canReadSurgeries, canManageSurgeries } from '@/actions/surgeries';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { SurgeryStay } from '@/components/surgeries/surgery-stay';

interface CirugiaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CirugiaDetailPage({ params }: CirugiaDetailPageProps) {
  const canRead = await canReadSurgeries();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [surgery, canWrite, settlementAccess] = await Promise.all([
    getSurgery(id),
    canManageSurgeries(),
    canReadSettlementSourceClaims(),
  ]);

  if (!surgery) notFound();

  const settlementClaim =
    settlementAccess && surgery.status === 'completada'
      ? await getSettlementClaimForSource('surgery', surgery.id)
      : null;
  const settlementDetailBasePath =
    settlementAccess === 'own' ? '/liquidaciones/mis-liquidaciones' : '/liquidaciones';

  return (
    <SurgeryStay
      surgery={surgery}
      canWrite={canWrite}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
    />
  );
}
