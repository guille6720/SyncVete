import { notFound, redirect } from 'next/navigation';
import {
  canApproveProfessionalSettlements,
  canPayProfessionalSettlements,
  canReadProfessionalSettlements,
  canWriteProfessionalCompensation,
  getSettlement,
} from '@/actions/professional-settlements';
import { getProfessional } from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { SettlementDetail } from '@/components/professionals/settlement-detail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LiquidacionDetailPage({ params }: PageProps) {
  const canRead = await canReadProfessionalSettlements();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const settlement = await getSettlement(id);
  if (!settlement) notFound();

  const [professional, organization, canApprove, canPay, canAdjust] = await Promise.all([
    getProfessional(settlement.professional_id),
    getOrganization(),
    canApproveProfessionalSettlements(),
    canPayProfessionalSettlements(),
    canWriteProfessionalCompensation(),
  ]);

  return (
    <SettlementDetail
      settlement={settlement}
      professional={professional}
      organizationName={organization?.name ?? 'Clínica'}
      canApprove={canApprove}
      canPay={canPay}
      canAdjust={canAdjust}
      showAuditLink
    />
  );
}
