import { notFound, redirect } from 'next/navigation';
import { getLabOrder, canReadLab, canManageLab } from '@/actions/lab';
import { canSendWhatsApp } from '@/actions/whatsapp';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { LabOrderDetail } from '@/components/lab/lab-order-detail';

interface LabDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LabDetailPage({ params }: LabDetailPageProps) {
  const canRead = await canReadLab();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [data, canWrite, canWhatsApp, settlementAccess] = await Promise.all([
    getLabOrder(id),
    canManageLab(),
    canSendWhatsApp(),
    canReadSettlementSourceClaims(),
  ]);

  if (!data) notFound();

  const settlementClaim =
    settlementAccess && data.order.status === 'completada'
      ? await getSettlementClaimForSource('lab_order', data.order.id)
      : null;
  const settlementDetailBasePath =
    settlementAccess === 'own' ? '/liquidaciones/mis-liquidaciones' : '/liquidaciones';

  return (
    <LabOrderDetail
      order={data.order}
      items={data.items}
      canWrite={canWrite}
      canSendWhatsApp={canWhatsApp}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
    />
  );
}
