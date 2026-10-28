import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProfessionalSchedulePanel } from '@/components/appointments/professional-schedule-panel';
import {
  canReadProfessionalCompensation,
  canReadProfessionalSettlements,
  canWriteProfessionalCompensation,
  listCompensationRules,
  listCompensationSchemes,
  listSettlements,
} from '@/actions/professional-settlements';
import { listProfessionalSchedules } from '@/actions/appointment-availability';
import {
  canReadProfessionals,
  canWriteProfessionals,
  getProfessional,
  getProfessionalSettlementSummary,
  listProfessionalBranches,
} from '@/actions/professionals';
import { ProfessionalSummaryStrip } from '@/components/professionals/professional-summary-strip';
import { canReadAppointments, getAssignableStaff } from '@/actions/appointments';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { CompensationPanel } from '@/components/professionals/compensation-panel';
import { ProfessionalSettlementsLink } from '@/components/professionals/professional-settlements-link';
import { ProfessionalForm } from '@/components/professionals/professional-form';
import { parseOrganizationSettings, PROFESSIONAL_RELATIONSHIP_LABELS } from '@sincvete/shared';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfesionalDetailPage({ params }: PageProps) {
  const canRead = await canReadProfessionals();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const professional = await getProfessional(id);
  if (!professional) notFound();

  const canReadAgenda = await canReadAppointments();

  const [
    branches,
    professionalBranches,
    staff,
    canWrite,
    canReadComp,
    canWriteComp,
    canReadSettlements,
    organization,
    settlementSummary,
    schedules,
  ] = await Promise.all([
    getUserBranches(),
    listProfessionalBranches(id),
    getAssignableStaff(),
    canWriteProfessionals(),
    canReadProfessionalCompensation(),
    canWriteProfessionalCompensation(),
    canReadProfessionalSettlements(),
    getOrganization(),
    canReadProfessionalSettlements().then((allowed) =>
      allowed ? getProfessionalSettlementSummary(id) : null
    ),
    professional.user_id && canReadAgenda
      ? listProfessionalSchedules({ userId: professional.user_id }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const branchIds = professionalBranches.map((row) => row.branch_id);
  const initialHours = schedules.map((row) => ({
    weekday: row.weekday,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    slotDurationMinutes: row.slot_duration_minutes ?? 30,
  }));

  let schemes: Awaited<ReturnType<typeof listCompensationSchemes>> = [];
  const rulesByScheme: Record<string, Awaited<ReturnType<typeof listCompensationRules>>> = {};

  if (canReadComp) {
    schemes = await listCompensationSchemes(id);
    await Promise.all(
      schemes.map(async (scheme) => {
        rulesByScheme[scheme.id] = await listCompensationRules(scheme.id);
      })
    );
  }

  const recentSettlements = canReadSettlements
    ? (await listSettlements({ professionalId: id, page: 1, pageSize: 5 })).data
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {professional.last_name}, {professional.first_name}
        </h1>
        <p className="text-muted-foreground">
          {PROFESSIONAL_RELATIONSHIP_LABELS[professional.relationship_type] ??
            professional.relationship_type}
          {professional.specialty ? ` · ${professional.specialty}` : ''}
        </p>
      </div>

      {settlementSummary ? (
        <ProfessionalSummaryStrip
          professionalId={id}
          summary={settlementSummary}
          currency={currency}
          canCalculate={canWriteComp}
        />
      ) : null}

      {canReadAgenda && (
        <section className="space-y-3" aria-labelledby="professional-agenda-heading">
          <h2 id="professional-agenda-heading" className="text-lg font-semibold">
            Agenda del profesional
          </h2>
          {professional.user_id ? (
            <>
              <ProfessionalSchedulePanel
                fullName={`${professional.first_name} ${professional.last_name}`}
                specialty={professional.specialty}
                schedules={schedules}
                editHref={null}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link href={`/agenda?assigned=${professional.user_id}`}>
                    Ver turnos de este profesional
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/agenda/disponibilidad">Consultar disponibilidad</Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este profesional todavía no tiene un usuario vinculado a la agenda.
            </p>
          )}
        </section>
      )}

      {canWrite && (
        <ProfessionalForm
          mode="edit"
          professional={professional}
          branches={branches}
          branchIds={branchIds}
          staff={staff.map((member) => ({ userId: member.userId, fullName: member.fullName }))}
          initialHours={initialHours}
        />
      )}

      {canReadComp && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Compensación</h2>
          <CompensationPanel
            professionalId={id}
            schemes={schemes}
            rulesByScheme={rulesByScheme}
            canWrite={canWriteComp}
            currency={currency}
          />
        </div>
      )}

      {canReadSettlements && (
        <ProfessionalSettlementsLink
          professionalId={id}
          recentSettlements={recentSettlements}
          currency={currency}
        />
      )}
    </div>
  );
}
