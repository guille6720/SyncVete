import { notFound, redirect } from 'next/navigation';
import {
  canReadProfessionalSettlements,
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

  const [professional, organization, canReadOps] = await Promise.all([
    getProfessionalForCurrentUser(),
    getOrganization(),
    canReadProfessionalSettlements(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/liquidaciones/mis-liquidaciones">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a mis liquidaciones
          </Link>
        </Button>
      </div>

      <SettlementDetail
        settlement={settlement}
        professional={professional}
        organizationName={organization?.name ?? 'Clínica'}
        canApprove={false}
        canPay={false}
        canAdjust={false}
        readOnly
        operationalHref={canReadOps ? `/liquidaciones/${settlement.id}` : null}
      />
    </div>
  );
}
