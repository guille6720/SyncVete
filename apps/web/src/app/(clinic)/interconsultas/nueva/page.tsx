import { redirect } from 'next/navigation';
import Link from 'next/link';
import { parseOrganizationSettings } from '@sincvete/shared';
import { canWriteInterconsultations } from '@/actions/interconsultations';
import { listProfessionals } from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { getSessionContext } from '@/actions/auth';
import { InterconsultationCreateForm } from '@/components/interconsultations/interconsultation-create-form';

export default async function NuevaInterconsultaPage() {
  const canWrite = await canWriteInterconsultations();
  if (!canWrite) redirect('/interconsultas');

  const session = await getSessionContext();
  const [professionals, organization] = await Promise.all([
    listProfessionals({ activeOnly: true }),
    getOrganization(),
  ]);
  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/interconsultas" className="text-sm text-muted-foreground hover:underline">
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nueva interconsulta</h1>
        <p className="text-muted-foreground">
          Pedí opinión o servicio a uno o varios profesionales
        </p>
      </div>
      <InterconsultationCreateForm
        professionals={professionals}
        currency={currency}
        defaultBranchId={session?.branchId}
      />
    </div>
  );
}
