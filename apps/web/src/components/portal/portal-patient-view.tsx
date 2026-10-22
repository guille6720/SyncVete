import Link from 'next/link';
import { OwnerVaccineCalendar } from '@/components/portal/owner-vaccine-calendar';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  APPOINTMENT_TYPE_LABELS,
  CLINICAL_ENTRY_TYPE_LABELS,
  SPECIES_EMOJI,
  VACCINATION_DUE_STATUS_LABELS,
  VACCINATION_DUE_STATUS_VARIANT,
  formatDashboardDateTime,
  formatVaccinationDate,
  type OwnerPortalPatient,
} from '@sincvete/shared';

interface PortalPatientViewProps {
  detail: OwnerPortalPatient;
}

export function PortalPatientView({ detail }: PortalPatientViewProps) {
  const { patient } = detail;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/portal">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al portal
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{SPECIES_EMOJI[patient.species] ?? '🐾'}</span>
            {patient.name}
          </CardTitle>
          <CardDescription>
            {patient.species}
            {patient.breed ? ` · ${patient.breed}` : ''}
            {patient.sex ? ` · ${patient.sex}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Nacimiento" value={formatVaccinationDate(patient.birthDate)} />
          <Field label="Color" value={patient.color} />
          <Field label="Microchip" value={patient.microchip} />
          <Field label="Castrado/a" value={patient.isNeutered ? 'Sí' : 'No'} />
        </CardContent>
      </Card>

      <OwnerVaccineCalendar vaccines={detail.vaccines} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vacunas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.vaccines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin vacunas registradas.</p>
          ) : (
            detail.vaccines.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{row.vaccineName}</p>
                  <p className="text-muted-foreground">
                    Aplicada {formatVaccinationDate(row.administeredAt)}
                    {row.nextDueAt ? ` · próxima ${formatVaccinationDate(row.nextDueAt)}` : ''}
                  </p>
                </div>
                <Badge variant={VACCINATION_DUE_STATUS_VARIANT[row.dueStatus]}>
                  {VACCINATION_DUE_STATUS_LABELS[row.dueStatus]}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Turnos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin turnos.</p>
          ) : (
            detail.appointments.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{APPOINTMENT_TYPE_LABELS[row.appointmentType]}</p>
                  <p className="text-muted-foreground">{formatDashboardDateTime(row.startsAt)}</p>
                </div>
                <Badge variant={APPOINTMENT_STATUS_VARIANT[row.status]}>
                  {APPOINTMENT_STATUS_LABELS[row.status]}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seguimiento de tratamientos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.clinical.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin atenciones para mostrar.</p>
          ) : (
            detail.clinical.map((row) => (
              <div key={row.id} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>{CLINICAL_ENTRY_TYPE_LABELS[row.entryType]}</Badge>
                  <span className="text-muted-foreground">
                    {formatDashboardDateTime(row.entryDate)}
                  </span>
                </div>
                {row.title && <p className="text-sm font-medium">{row.title}</p>}
                {row.diagnosis && <p className="text-sm">{row.diagnosis}</p>}
                {row.treatment && (
                  <p className="text-sm text-muted-foreground">Tratamiento: {row.treatment}</p>
                )}
                {row.plan && <p className="text-sm text-muted-foreground">{row.plan}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || '—'}</p>
    </div>
  );
}
