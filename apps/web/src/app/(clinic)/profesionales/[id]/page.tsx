import { notFound, redirect } from 'next/navigation';
import {
  canReadProfessionalCompensation,
  canReadProfessionalSettlements,
  canWriteProfessionalCompensation,
  listCompensationRules,
  listCompensationSchemes,
  listSettlements,
} from '@/actions/professional-settlements';
import {
  canReadProfessionals,
  canWriteProfessionals,
  getProfessional,
  listProfessionalBranches,
} from '@/actions/professionals';
import { getAssignableStaff } from '@/actions/appointments';
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

  const [branches, professionalBranches, staff, canWrite, canReadComp, canWriteComp, canReadSettlements, organization] =
    await Promise.all([
      getUserBranches(),
      listProfessionalBranches(id),
      getAssignableStaff(),
      canWriteProfessionals(),
      canReadProfessionalCompensation(),
      canWriteProfessionalCompensation(),
      canReadProfessionalSettlements(),
      getOrganization(),
    ]);

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const branchIds = professionalBranches.map((row) => row.branch_id);

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
          {PROFESSIONAL_RELATIONSHIP_LABELS[professional.relationship_type]}
          {professional.specialty ? ` · ${professional.specialty}` : ''}
        </p>
      </div>

      {canWrite && (
        <ProfessionalForm
          mode="edit"
          professional={professional}
          branches={branches}
          branchIds={branchIds}
          staff={staff.map((member) => ({ userId: member.userId, fullName: member.fullName }))}
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
