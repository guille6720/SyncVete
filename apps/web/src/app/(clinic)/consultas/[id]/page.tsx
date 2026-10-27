import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  getConsultation,
  canReadConsultationHistory,
  canManageConsultations,
} from '@/actions/consultations';
import { ConsultationSoapForm } from '@/components/consultations/consultation-soap-form';
import { ConsultationDetail } from '@/components/consultations/consultation-detail';
import { ClinicalAiSoapPanel } from '@/components/clinical-ai/clinical-ai-soap-panel';
import { Button } from '@/components/ui/button';
import { canManageBilling } from '@/actions/billing';
import { getClinicalAiStatus } from '@/actions/clinical-ai';
import { canManageAppointments, getAssignableStaff } from '@/actions/appointments';
import {
  canReadSettlementSourceClaims,
  getSettlementClaimForSource,
} from '@/actions/professional-settlements';
import { buildSettlementDetailBasePath } from '@sincvete/shared';

interface ConsultaPageProps {
  params: Promise<{ id: string }>;
}

export default async function ConsultaDetailPage({ params }: ConsultaPageProps) {
  const canRead = await canReadConsultationHistory();
  if (!canRead) redirect('/consultas');

  const { id } = await params;
  const [consultation, canWrite, canWriteBilling, aiStatus, settlementAccess, canRefer] =
    await Promise.all([
      getConsultation(id),
      canManageConsultations(),
      canManageBilling(),
      getClinicalAiStatus(),
      canReadSettlementSourceClaims(),
      canManageAppointments(),
    ]);

  if (!consultation) notFound();

  const settlementClaim =
    settlementAccess && consultation.status === 'completada'
      ? await getSettlementClaimForSource('consultation', consultation.id)
      : null;
  const settlementDetailBasePath = buildSettlementDetailBasePath(settlementAccess);
  const staff = canRefer ? await getAssignableStaff().catch(() => []) : [];

  const isOpen = consultation.status === 'en_curso' || consultation.status === 'en_espera';

  if (isOpen && canWrite) {
    return (
      <div className="mx-auto max-w-6xl space-y-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/consultas">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a consultas
          </Link>
        </Button>
        <ConsultationSoapForm
          consultation={consultation}
          canWriteBilling={canWriteBilling}
          canRefer={canRefer}
          staff={staff}
        />
        {aiStatus.soapEntitled ? (
          <ClinicalAiSoapPanel
            consultationId={consultation.id}
            patientId={consultation.patient_id}
            configured={aiStatus.configured && aiStatus.canGenerate}
          />
        ) : null}
      </div>
    );
  }

  return (
    <ConsultationDetail
      consultation={consultation}
      canWrite={canWrite}
      canWriteBilling={canWriteBilling}
      settlementClaim={settlementClaim}
      settlementDetailBasePath={settlementDetailBasePath}
    />
  );
}
