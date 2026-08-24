import { notFound, redirect } from 'next/navigation';
import { getSurgery, canReadSurgeries, canManageSurgeries } from '@/actions/surgeries';
import {
  canReadProfessionalSettlements,
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
  const [surgery, canWrite, canReadSettlements] = await Promise.all([
    getSurgery(id),
    canManageSurgeries(),
    canReadProfessionalSettlements(),
  ]);

  if (!surgery) notFound();

  const settlementClaim =
    canReadSettlements && surgery.status === 'completada'
      ? await getSettlementClaimForSource('surgery', surgery.id)
      : null;

  return <SurgeryStay surgery={surgery} canWrite={canWrite} settlementClaim={settlementClaim} />;
}
