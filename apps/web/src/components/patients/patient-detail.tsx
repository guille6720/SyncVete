'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BedDouble,
  ClipboardList,
  FlaskConical,
  MessageCircle,
  Pencil,
  Pill,
  Receipt,
  Scissors,
  Syringe,
  Sparkles,
  Hourglass,
  Trash2,
  Images,
} from 'lucide-react';
import { deletePatient } from '@/actions/patients';
import { runClinicExportAction } from '@/actions/data-migration';
import { PatientVaccineStatus } from '@/components/vaccinations/patient-vaccine-status';
import { PatientClinicalRecent } from '@/components/patients/patient-clinical-recent';
import { PatientWaitingRoomHistory } from '@/components/patients/patient-waiting-room-history';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  HOSPITALIZATION_STATUS_LABELS,
  SPECIES_EMOJI,
  buildClinicalAiPath,
  buildWhatsAppComposePath,
  isClinicPathEntitled,
  type ClinicalEntryListRow,
  type HospitalizationStatus,
  type Owner,
  type Patient,
  type SurgeryStatus,
  type VaccinationDueRow,
  type PatientWaitingRoomHistoryRow,
} from '@sincvete/shared';

interface PatientDetailProps {
  patient: Patient;
  owner: Owner | null;
  canWrite: boolean;
  canReadClinical?: boolean;
  canWriteClinical?: boolean;
  canWriteBilling?: boolean;
  canSendWhatsApp?: boolean;
  canExportData?: boolean;
  clinicalEntryCount?: number;
  recentClinicalEntries?: ClinicalEntryListRow[];
  activeHospitalization?: { id: string; status: HospitalizationStatus } | null;
  activeSurgery?: { id: string; status: SurgeryStatus } | null;
  vaccineStatus?: VaccinationDueRow[];
  entitledHrefs?: string[] | null;
  waitingRoomHistory?: PatientWaitingRoomHistoryRow[];
}

function formatAge(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    years -= 1;
  }

  if (years >= 1) return `${years} año${years !== 1 ? 's' : ''}`;
  const months = Math.max(
    0,
    (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth()
  );
  return months > 0 ? `${months} mes${months !== 1 ? 'es' : ''}` : 'Menos de 1 mes';
}

export function PatientDetail({
  patient,
  owner,
  canWrite,
  canReadClinical = false,
  canWriteClinical = false,
  canWriteBilling = false,
  canSendWhatsApp = false,
  canExportData = false,
  clinicalEntryCount = 0,
  recentClinicalEntries = [],
  activeHospitalization = null,
  activeSurgery = null,
  vaccineStatus = [],
  entitledHrefs = null,
  waitingRoomHistory = [],
}: PatientDetailProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const age = formatAge(patient.birth_date);
  const entitled = (href: string) => isClinicPathEntitled(href, entitledHrefs);

  const handleDelete = () => {
    if (!confirm('¿Eliminar este paciente? Esta acción no se puede deshacer.')) return;
    void runPending(async () => {
      const result = await deletePatient(patient.id);
      if (result.success) {
        router.push('/pacientes');
        return;
      }
      window.alert(result.error ?? 'No se pudo eliminar el paciente');
    });
  };

  const handleExportClinical = (format: 'zip' | 'pdf' | 'json') => {
    void runPending(async () => {
      const form = new FormData();
      form.set('exportType', 'patient_clinical');
      form.set('format', format);
      form.set('patientId', patient.id);
      const result = await runClinicExportAction(form);
      if (!result.success || !result.data) {
        window.alert(result.error ?? 'No se pudo exportar');
        return;
      }
      const binary = atob(result.data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: result.data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.data.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/pacientes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Link>
        </Button>
        {(canWrite || canReadClinical || canWriteClinical || canSendWhatsApp || canExportData) && (
          <div className="flex flex-wrap gap-2">
            {canExportData ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleExportClinical('pdf')}
                >
                  Exportar HC (PDF)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleExportClinical('zip')}
                >
                  Exportar HC (ZIP)
                </Button>
              </>
            ) : null}
            {canReadClinical && entitled('/historia-clinica') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/pacientes/${patient.id}/historia`}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Historia clínica{clinicalEntryCount > 0 ? ` (${clinicalEntryCount})` : ''}
                </Link>
              </Button>
            )}
            {entitled('/internacion') &&
              (activeHospitalization && canReadClinical ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/internacion/${activeHospitalization.id}`}>
                  <BedDouble className="mr-2 h-4 w-4" />
                  Ver internación
                </Link>
              </Button>
            ) : (
              canWriteClinical &&
              !patient.is_deceased && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/internacion/nueva?patientId=${patient.id}`}>
                    <BedDouble className="mr-2 h-4 w-4" />
                    Internar
                  </Link>
                </Button>
              )
            ))}
            {canWriteClinical && !patient.is_deceased && entitled('/vacunacion') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/vacunacion/nueva?patientId=${patient.id}`}>
                  <Syringe className="mr-2 h-4 w-4" />
                  Vacunar
                </Link>
              </Button>
            )}
            {entitled('/cirugias') &&
              (activeSurgery && canReadClinical ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/cirugias/${activeSurgery.id}`}>
                  <Scissors className="mr-2 h-4 w-4" />
                  Ver cirugía
                </Link>
              </Button>
            ) : (
              canWriteClinical &&
              !patient.is_deceased && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/cirugias/nueva?patientId=${patient.id}`}>
                    <Scissors className="mr-2 h-4 w-4" />
                    Cirugía
                  </Link>
                </Button>
              )
            ))}
            {canWriteClinical && !patient.is_deceased && entitled('/laboratorio') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/laboratorio/nueva?patientId=${patient.id}`}>
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Laboratorio
                </Link>
              </Button>
            )}
            {canWriteClinical && !patient.is_deceased && entitled('/farmacia') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/farmacia/nueva?patientId=${patient.id}`}>
                  <Pill className="mr-2 h-4 w-4" />
                  Recetar
                </Link>
              </Button>
            )}
            {canReadClinical && entitled('/imagenes') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/imagenes?patientId=${patient.id}`}>
                  <Images className="mr-2 h-4 w-4" />
                  Imágenes
                </Link>
              </Button>
            )}
            {canWriteClinical && !patient.is_deceased && entitled('/imagenes') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/imagenes/nueva?patientId=${patient.id}`}>
                  <Images className="mr-2 h-4 w-4" />
                  Subir imagen
                </Link>
              </Button>
            )}
            {canWriteBilling && entitled('/facturacion') && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/facturacion/nueva?patientId=${patient.id}`}>
                  <Receipt className="mr-2 h-4 w-4" />
                  Facturar
                </Link>
              </Button>
            )}
            {canReadClinical && entitled('/ia-clinica') && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={buildClinicalAiPath({
                    patientId: patient.id,
                    kind: 'patient_summary',
                  })}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  IA clínica
                </Link>
              </Button>
            )}
            {canSendWhatsApp && entitled('/whatsapp') && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={buildWhatsAppComposePath({
                    ownerId: patient.owner_id,
                    patientId: patient.id,
                  })}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  WhatsApp
                </Link>
              </Button>
            )}
            {entitled('/sala-espera') && waitingRoomHistory.length > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/sala-espera">
                  <Hourglass className="mr-2 h-4 w-4" />
                  Sala de espera
                </Link>
              </Button>
            )}
            {canWrite && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/pacientes/${patient.id}/editar`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  isPending={pending}
                >
                  {pending ? (
                    'Eliminando...'
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <Card className="overflow-hidden border-teal-300/50 bg-[linear-gradient(165deg,#f7fbf8_0%,#eef8f3_42%,#f4faf7_100%)] shadow-sm dark:border-teal-800/70 dark:bg-[linear-gradient(165deg,#14241f_0%,#1a2e28_45%,#15231f_100%)]">
        <CardHeader className="border-b border-teal-900/5 bg-[radial-gradient(ellipse_at_top_left,rgba(13,148,136,0.12),transparent_55%)] pb-5 dark:border-teal-400/10 dark:bg-[radial-gradient(ellipse_at_top_left,rgba(45,212,191,0.12),transparent_55%)]">
          <div className="flex flex-wrap items-center gap-4">
            {patient.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={patient.photo_url}
                alt={patient.name}
                className="h-20 w-20 rounded-full object-cover ring-4 ring-teal-600/15 dark:ring-teal-300/20"
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-100 text-3xl ring-4 ring-teal-600/15 dark:bg-teal-900/60 dark:ring-teal-300/20"
                aria-hidden
              >
                {SPECIES_EMOJI[patient.species]}
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <CardTitle className="text-2xl font-semibold tracking-tight text-teal-950 sm:text-3xl dark:text-teal-50">
                  {patient.photo_url ? `${SPECIES_EMOJI[patient.species]} ` : null}
                  {patient.name}
                </CardTitle>
                {patient.is_deceased ? (
                  <Badge variant="destructive" className="text-sm">
                    Fallecido
                  </Badge>
                ) : (
                  <Badge
                    variant={patient.is_active ? 'success' : 'destructive'}
                    className="text-sm"
                  >
                    {patient.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                )}
                {activeHospitalization && entitled('/internacion') && (
                  <Badge variant="warning" className="text-sm">
                    {HOSPITALIZATION_STATUS_LABELS[activeHospitalization.status]}
                  </Badge>
                )}
              </div>
              <p className="text-base text-teal-800/80 dark:text-teal-100/75">
                Ficha del paciente
                {patient.species ? ` · ${patient.species}` : ''}
                {patient.breed ? ` · ${patient.breed}` : ''}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-5">
          <DetailField
            label="Propietario"
            value={
              owner ? (
                <Link
                  href={`/propietarios/${owner.id}`}
                  className="font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-200"
                >
                  {owner.full_name}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <DetailField label="Especie" value={patient.species} />
          <DetailField label="Raza" value={patient.breed} />
          <DetailField label="Sexo" value={patient.sex} />
          <DetailField
            label="Fecha de nacimiento"
            value={
              patient.birth_date
                ? `${patient.birth_date}${age ? ` (${age})` : ''}`
                : null
            }
          />
          <DetailField label="Color" value={patient.color} />
          <DetailField label="Microchip" value={patient.microchip} />
          <DetailField
            label="Castrado / esterilizado"
            value={patient.is_neutered ? 'Sí' : 'No'}
          />
          {patient.is_deceased && (
            <DetailField label="Fecha de fallecimiento" value={patient.deceased_at} />
          )}
          {patient.notes && (
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={patient.notes} />
            </div>
          )}
        </CardContent>
      </Card>

      {entitled('/sala-espera') && waitingRoomHistory.length > 0 && (
        <PatientWaitingRoomHistory history={waitingRoomHistory} />
      )}

      {canReadClinical && entitled('/historia-clinica') && (
        <PatientClinicalRecent
          patientId={patient.id}
          entries={recentClinicalEntries}
          total={clinicalEntryCount}
          canWrite={canWriteClinical}
        />
      )}

      {canReadClinical && entitled('/vacunacion') && (
        <PatientVaccineStatus
          patientId={patient.id}
          items={vaccineStatus}
          canWrite={canWriteClinical}
          isDeceased={patient.is_deceased}
        />
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-medium text-teal-800/70 dark:text-teal-200/70">{label}</p>
      <div className="mt-1 text-base leading-relaxed text-teal-950 dark:text-teal-50">
        {value || '—'}
      </div>
    </div>
  );
}
