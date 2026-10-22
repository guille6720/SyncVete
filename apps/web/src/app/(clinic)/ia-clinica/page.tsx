import { redirect } from 'next/navigation';
import { getPatient } from '@/actions/patients';
import {
  canReadClinicalAi,
  getClinicalAiStatus,
  listClinicalAiSuggestions,
} from '@/actions/clinical-ai';
import { ClinicalAiGenerateForm } from '@/components/clinical-ai/clinical-ai-generate-form';
import { ClinicalAiHistory } from '@/components/clinical-ai/clinical-ai-history';
import { FeatureUnavailableNotice } from '@/components/entitlements/feature-gate';
import { getMeteredUsageMeters } from '@/lib/entitlements';
import { getSessionContext } from '@/lib/session';
import {
  CLINICAL_AI_KINDS,
  FEATURES,
  type ClinicalAiKind,
} from '@sincvete/shared';
import { moduleTourTargets } from '@sincvete/shared';

interface IaClinicaPageProps {
  searchParams: Promise<{
    page?: string;
    patientId?: string;
    kind?: string;
    consultationId?: string;
    clinicalEntryId?: string;
  }>;
}

export default async function IaClinicaPage({ searchParams }: IaClinicaPageProps) {
  const canRead = await canReadClinicalAi();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const kindParam = params.kind?.trim() ?? '';
  const kind = CLINICAL_AI_KINDS.includes(kindParam as ClinicalAiKind)
    ? (kindParam as ClinicalAiKind)
    : undefined;
  const patientId = params.patientId?.trim() || undefined;

  const [status, history, patient, session] = await Promise.all([
    getClinicalAiStatus(),
    listClinicalAiSuggestions({
      page,
      pageSize: 10,
      patientId,
      kind,
    }),
    patientId ? getPatient(patientId).catch(() => null) : Promise.resolve(null),
    getSessionContext(),
  ]);
  const usage = session
    ? (await getMeteredUsageMeters(session.organizationId)).find(
        (meter) => meter.featureKey === FEATURES.AI_MONTHLY_REQUESTS
      )
    : null;

  const tour = moduleTourTargets('ia-clinica');
  return (
    <div className="space-y-8" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">IA clínica</h1>
        <p className="text-muted-foreground">
          Resumen del paciente, asistencia SOAP e indicaciones para el tutor.
        </p>
      </div>

      {!status.entitled ? (
        <FeatureUnavailableNotice
          title="IA clínica no incluida"
          description="Esta función forma parte de planes superiores. Contactá a SyncVete para habilitarla."
        />
      ) : (
        <ClinicalAiGenerateForm
          defaultPatientId={patient?.id}
          defaultPatientName={patient?.name}
          defaultOwnerId={patient?.owner_id}
          defaultKind={kind ?? 'patient_summary'}
          consultationId={params.consultationId?.trim() || undefined}
          clinicalEntryId={params.clinicalEntryId?.trim() || undefined}
          configured={status.configured}
          canGenerate={status.canGenerate}
          usage={usage}
        />
      )}

      <ClinicalAiHistory data={history} />
    </div>
  );
}
