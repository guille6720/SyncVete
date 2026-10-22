import { notFound, redirect } from 'next/navigation';
import { getCashSession, canReadCash } from '@/actions/cash';
import { getOrganization } from '@/actions/settings';
import { CashSessionDetail } from '@/components/cash/cash-session-detail';
import { resolveListHref } from '@/lib/list-return';
import { parseOrganizationSettings } from '@sincvete/shared';

interface CajaDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}

export default async function CajaDetailPage({ params, searchParams }: CajaDetailPageProps) {
  const canRead = await canReadCash();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const query = await searchParams;
  const [data, organization] = await Promise.all([getCashSession(id), getOrganization()]);

  if (!data) notFound();

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

  return (
    <CashSessionDetail
      session={data.session}
      movements={data.movements}
      currency={currency}
      listHref={resolveListHref('/caja', query.return)}
    />
  );
}
