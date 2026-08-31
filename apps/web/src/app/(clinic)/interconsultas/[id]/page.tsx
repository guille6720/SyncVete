import { notFound, redirect } from 'next/navigation';
import {
  canApproveInterconsultations,
  canBillInterconsultations,
  canReadInterconsultations,
  canWriteInterconsultations,
  getInterconsultation,
} from '@/actions/interconsultations';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/actions/auth';
import { InterconsultationDetailClient } from '@/components/interconsultations/interconsultation-detail-client';

export default async function InterconsultaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const canRead = await canReadInterconsultations();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [detail, canWrite, canApprove, canBill, session] = await Promise.all([
    getInterconsultation(id),
    canWriteInterconsultations(),
    canApproveInterconsultations(),
    canBillInterconsultations(),
    getSessionContext(),
  ]);

  if (!detail) notFound();

  let draftSettlements: Array<{
    id: string;
    professional_id: string;
    period_start: string;
    period_end: string;
  }> = [];

  const professionalIds = detail.settlementLinks.map((l) => l.professionalId);
  if (session && professionalIds.length > 0) {
    const supabase = await createServerClient();
    const { data } = await supabase
      .from('professional_settlements')
      .select('id, professional_id, period_start, period_end')
      .eq('organization_id', session.organizationId)
      .eq('status', 'draft')
      .in('professional_id', professionalIds)
      .is('deleted_at', null)
      .order('period_end', { ascending: false })
      .limit(20);
    draftSettlements = (data ?? []) as typeof draftSettlements;
  }

  return (
    <InterconsultationDetailClient
      detail={detail}
      canWrite={canWrite}
      canApprove={canApprove}
      canBill={canBill}
      draftSettlements={draftSettlements}
    />
  );
}
