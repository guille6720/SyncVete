import Link from 'next/link';
import { Calendar, PawPrint, Receipt, Syringe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  APPOINTMENT_TYPE_LABELS,
  CLINICAL_ENTRY_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
  SPECIES_EMOJI,
  VACCINATION_DUE_STATUS_LABELS,
  VACCINATION_DUE_STATUS_VARIANT,
  formatDashboardDateTime,
  formatMoney,
  formatVaccinationDate,
  type OwnerPortalHome,
} from '@sincvete/shared';

interface PortalHomeProps {
  home: OwnerPortalHome;
}

export function PortalHome({ home }: PortalHomeProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola, {home.owner.fullName}</h1>
        <p className="text-muted-foreground">
          Portal de {home.clinic.name}
          {home.clinic.phone ? ` · ${home.clinic.phone}` : ''}
        </p>
        {home.clinic.email && (
          <a className="text-sm text-primary underline" href={`mailto:${home.clinic.email}`}>
            {home.clinic.email}
          </a>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mis mascotas</h2>
        {home.patients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay mascotas asociadas.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {home.patients.map((patient) => (
              <Link key={patient.id} href={`/portal/mascotas/${patient.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span>{SPECIES_EMOJI[patient.species] ?? '🐾'}</span>
                      {patient.name}
                    </CardTitle>
                    <CardDescription>
                      {patient.species}
                      {patient.breed ? ` · ${patient.breed}` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {patient.isDeceased && <Badge variant="destructive">Fallecido</Badge>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-4 w-4" />
              Próximos turnos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {home.upcomingAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay turnos próximos.</p>
            ) : (
              home.upcomingAppointments.map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{row.patientName ?? 'Mascota'}</p>
                    <p className="text-muted-foreground">
                      {APPOINTMENT_TYPE_LABELS[row.appointmentType]} ·{' '}
                      {formatDashboardDateTime(row.startsAt)}
                    </p>
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
            <CardTitle className="flex items-center gap-2 text-lg">
              <Syringe className="h-4 w-4" />
              Vacunas a vencer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {home.vaccinesDue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay vacunas vencidas o por vencer.</p>
            ) : (
              home.vaccinesDue.map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {row.patientName} · {row.vaccineName}
                    </p>
                    <p className="text-muted-foreground">
                      Próxima: {formatVaccinationDate(row.nextDueAt)}
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
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-4 w-4" />
            Facturas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {home.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay facturas emitidas.</p>
          ) : (
            home.invoices.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{row.number ?? 'Sin número'}</p>
                  <p className="text-muted-foreground">
                    {row.patientName ?? 'Clínica'} · {formatMoney(row.total, row.currency)}
                    {row.balance > 0 ? ` · saldo ${formatMoney(row.balance, row.currency)}` : ''}
                  </p>
                </div>
                <Badge variant={INVOICE_STATUS_VARIANT[row.status]}>
                  {INVOICE_STATUS_LABELS[row.status]}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PawPrint className="h-4 w-4" />
            Últimas atenciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {home.recentClinical.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay atenciones para mostrar.</p>
          ) : (
            home.recentClinical.map((row) => (
              <div key={row.id} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{row.patientName}</span>
                  <Badge>{CLINICAL_ENTRY_TYPE_LABELS[row.entryType]}</Badge>
                  <span className="text-muted-foreground">
                    {formatDashboardDateTime(row.entryDate)}
                  </span>
                </div>
                {row.diagnosis && <p className="text-sm">{row.diagnosis}</p>}
                {row.treatment && <p className="text-sm">Tratamiento: {row.treatment}</p>}
                {row.plan && <p className="text-sm text-muted-foreground">{row.plan}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
