import { notFound, redirect } from 'next/navigation';
import {
  canViewProfessionalSettlement,
  getSettlement,
} from '@/actions/professional-settlements';
import { getProfessionalForCurrentUser } from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { SettlementDetail } from '@/components/professionals/settlement-detail';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MisLiquidacionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const settlement = await getSettlement(id);
  if (!settlement) notFound();

  const access = await canViewProfessionalSettlement(settlement.professional_id);
  if (access !== 'own') redirect('/liquidaciones/mis-liquidaciones');

  const [professional, organization] = await Promise.all([
    getProfessionalForCurrentUser(),
    getOrganization(),
  ]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/liquidaciones/mis-liquidaciones">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a mis liquidaciones
        </Link>
      </Button>

      <SettlementDetail
        settlement={settlement}
        professional={professional}
        organizationName={organization?.name ?? 'Clínica'}
        canApprove={false}
        canPay={false}
        canAdjust={false}
        readOnly
      />
    </div>
  );
}
