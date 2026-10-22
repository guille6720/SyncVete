import { notFound, redirect } from 'next/navigation';
import { getVaccination, canReadVaccinations, canManageVaccinations } from '@/actions/vaccinations';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { buildSettlementDetailBasePath } from '@sincvete/shared';
import { VaccinationDetail } from '@/components/vaccinations/vaccination-detail';

interface VacunacionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function VacunacionDetailPage({ params }: VacunacionDetailPageProps) {
  const canRead = await canReadVaccinations();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [vaccination, canWrite, settlementAccess] = await Promise.all([
    getVaccination(id),
    canManageVaccinations(),
    canReadSettlementSourceClaims(),
  ]);

  if (!vaccination) notFound();

  const settlementClaim = settlementAccess
    ? await getSettlementClaimForSource('vaccination', vaccination.id)
    : null;
  const settlementDetailBasePath = buildSettlementDetailBasePath(settlementAccess);

  return (
    <VaccinationDetail
      vaccination={vaccination}
      canWrite={canWrite}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
    />
  );
}
