import { notFound, redirect } from 'next/navigation';
import { getPatient } from '@/actions/patients';
import { listPatientWaitingRoomHistory, canReadWaitingRoom } from '@/actions/waiting-room';
import { getOwner } from '@/actions/owners';
import { listClinicalEntries } from '@/actions/clinical-entries';
import { getActiveHospitalizationByPatient } from '@/actions/hospitalizations';
import { listPatientVaccineStatus } from '@/actions/vaccinations';
import { getActiveSurgeryByPatient } from '@/actions/surgeries';
import { PatientDetail } from '@/components/patients/patient-detail';
import { getSessionContext } from '@/lib/session';
import { CLINICAL_RECENT_PAGE_SIZE, isClinicPathEntitled } from '@sincvete/shared';
import { getClinicCommercialShell } from '@/lib/entitlements';

interface PatientPageProps {
  params: Promise<{ id: string }>;
}

export default async function PacienteDetailPage({ params }: PatientPageProps) {
  const [session, { id }] = await Promise.all([getSessionContext(), params]);
  if (!session?.permissions.includes('patients:read')) redirect('/dashboard');

  const patient = await getPatient(id);
  if (!patient) notFound();

  const canReadClinical = session.permissions.includes('clinical:read');

  const [owner, recentClinical, activeHospitalization, activeSurgery, vaccineStatus, commercial, canReadWr] =
    await Promise.all([
      getOwner(patient.owner_id),
      canReadClinical
        ? listClinicalEntries({
            page: 1,
            pageSize: CLINICAL_RECENT_PAGE_SIZE,
            patientId: id,
          }).catch(() => null)
        : Promise.resolve(null),
      getActiveHospitalizationByPatient(id),
      getActiveSurgeryByPatient(id),
      listPatientVaccineStatus(id),
      getClinicCommercialShell(session.organizationId),
      canReadWaitingRoom(),
    ]);

  const waitingRoomHistory =
    canReadWr && isClinicPathEntitled('/sala-espera', commercial.entitledHrefs)
      ? await listPatientWaitingRoomHistory(id)
      : [];

  return (
    <PatientDetail
      patient={patient}
      owner={owner}
      canWrite={session.permissions.includes('patients:write')}
      canReadClinical={canReadClinical}
      canWriteClinical={session.permissions.includes('clinical:write')}
      clinicalEntryCount={recentClinical?.total ?? 0}
      recentClinicalEntries={recentClinical?.data ?? []}
      activeHospitalization={activeHospitalization}
      activeSurgery={activeSurgery}
      vaccineStatus={vaccineStatus}
      canWriteBilling={session.permissions.includes('billing:write')}
      canSendWhatsApp={session.permissions.includes('whatsapp:send')}
      canExportData={session.permissions.includes('data:export')}
      entitledHrefs={commercial.entitledHrefs}
      waitingRoomHistory={waitingRoomHistory}
    />
  );
}
