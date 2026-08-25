import { notFound, redirect } from 'next/navigation';
import { getHospitalization, canReadHospitalizations, canManageHospitalizations } from '@/actions/hospitalizations';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimsForSources,
} from '@/actions/professional-settlements';
import { HospitalizationStay } from '@/components/hospitalizations/hospitalization-stay';

interface InternacionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function InternacionDetailPage({ params }: InternacionDetailPageProps) {
  const canRead = await canReadHospitalizations();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [result, canWrite, settlementAccess] = await Promise.all([
    getHospitalization(id),
    canManageHospitalizations(),
    canReadSettlementSourceClaims(),
  ]);

  if (!result) notFound();

  const settlementDetailBasePath =
    settlementAccess === 'own' ? '/liquidaciones/mis-liquidaciones' : '/liquidaciones';
  const settlementClaimsByNoteId =
    settlementAccess && result.notes.length > 0
      ? await getSettlementClaimsForSources(
          'shift',
          result.notes.map((note) => note.id)
        )
      : {};

  return (
    <HospitalizationStay
      stay={result.stay}
      notes={result.notes}
      canWrite={canWrite}
      settlementClaimsByNoteId={settlementClaimsByNoteId}
      settlementDetailBasePath={settlementDetailBasePath}
    />
  );
}
