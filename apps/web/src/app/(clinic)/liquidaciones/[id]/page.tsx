import { notFound, redirect } from 'next/navigation';
import {
  canApproveProfessionalSettlements,
  canPayProfessionalSettlements,
  canReadProfessionalSettlements,
  canWriteProfessionalCompensation,
  getSettlement,
  getSettlementDuplicateClaimWarnings,
} from '@/actions/professional-settlements';
import { getOpenCashSession } from '@/actions/cash';
import { getProfessional } from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { SettlementDetail } from '@/components/professionals/settlement-detail';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LiquidacionDetailPage({ params }: PageProps) {
  const canRead = await canReadProfessionalSettlements();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const settlement = await getSettlement(id);
  if (!settlement) notFound();

  const [professional, organization, canApprove, canPay, canAdjust, duplicateWarnings, canCash] =
    await Promise.all([
      getProfessional(settlement.professional_id),
      getOrganization(),
      canApproveProfessionalSettlements(),
      canPayProfessionalSettlements(),
      canWriteProfessionalCompensation(),
      getSettlementDuplicateClaimWarnings(id),
      canPermissionAndFeature('billing:write', FEATURES.CASH_REGISTER),
    ]);

  let openCashSessionId: string | null = null;
  if (canCash && canPay) {
    try {
      const openSession = await getOpenCashSession();
      openCashSessionId = openSession?.id ?? null;
    } catch {
      openCashSessionId = null;
    }
  }

  return (
    <SettlementDetail
      settlement={settlement}
      professional={professional}
      organizationName={organization?.name ?? 'Clínica'}
      canApprove={canApprove}
      canPay={canPay}
      canAdjust={canAdjust}
      duplicateWarnings={duplicateWarnings}
      showAuditLink
      openCashSessionId={openCashSessionId}
      canPostCashEgreso={Boolean(canCash && openCashSessionId)}
    />
  );
}
