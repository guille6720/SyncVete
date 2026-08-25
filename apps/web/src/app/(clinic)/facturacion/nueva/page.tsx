import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canManageBilling } from '@/actions/billing';
import { getSessionContext } from '@/actions/auth';
import { getOwner } from '@/actions/owners';
import { getPatient } from '@/actions/patients';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { InvoiceForm } from '@/components/billing/invoice-form';
import { Button } from '@/components/ui/button';
import { resolveListHref } from '@/lib/list-return';
import { parseOrganizationSettings } from '@sincvete/shared';

interface NuevaFacturaPageProps {
  searchParams: Promise<{
    patientId?: string;
    consultationId?: string;
    return?: string;
  }>;
}

export default async function NuevaFacturaPage({ searchParams }: NuevaFacturaPageProps) {
  const canWrite = await canManageBilling();
  if (!canWrite) redirect('/facturacion');

  const params = await searchParams;
  const session = await getSessionContext();
  const listHref = resolveListHref('/facturacion', params.return);

  let patient = null;
  let owner = null;
  if (params.patientId) {
    patient = await getPatient(params.patientId);
    if (patient) owner = await getOwner(patient.owner_id);
  }

  const [branches, organization] = await Promise.all([getUserBranches(), getOrganization()]);
  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a facturación
        </Link>
      </Button>
      <InvoiceForm
        branches={branches}
        defaultBranchId={session?.branchId}
        defaultPatientId={patient?.id}
        defaultPatientName={patient?.name}
        defaultOwnerId={patient?.owner_id}
        defaultOwnerName={owner?.full_name}
        defaultConsultationId={params.consultationId}
        currency={currency}
        listHref={listHref}
      />
    </div>
  );
}
