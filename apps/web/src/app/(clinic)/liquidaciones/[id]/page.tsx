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
import { getProfessional, getProfessionalForCurrentUser } from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { SettlementDetail } from '@/components/professionals/settlement-detail';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
import { buildSettlementDetailHref } from '@sincvete/shared';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LiquidacionDetailPage({ params }: PageProps) {
  const canRead = await canReadProfessionalSettlements();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const settlement = await getSettlement(id);
  if (!settlement) notFound();

  const [professional, organization, canApprove, canPay, canAdjust, duplicateWarnings, canCash, linkedProfessional] =
    await Promise.all([
      getProfessional(settlement.professional_id),
      getOrganization(),
      canApproveProfessionalSettlements(),
      canPayProfessionalSettlements(),
      canWriteProfessionalCompensation(),
      getSettlementDuplicateClaimWarnings(id),
      canPermissionAndFeature('billing:write', FEATURES.CASH_REGISTER),
      getProfessionalForCurrentUser(),
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

  const portalHref =
    linkedProfessional && linkedProfessional.id === settlement.professional_id
      ? buildSettlementDetailHref('own', settlement.id)
      : null;

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
      canPostCashEgreso={Boolean(canCash)}
      portalHref={portalHref}
    />
  );
}
