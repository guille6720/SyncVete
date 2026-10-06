import { redirect, notFound } from 'next/navigation';
import { getSessionContext } from '@/actions/auth';
import { getOwnerAppBrand } from '@/actions/owner-app';

export default async function OwnerAppStart({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const session = await getSessionContext();
  if (!session || session.kind !== 'portal' || session.organizationId !== organizationId)
    notFound();
  const brand = await getOwnerAppBrand(organizationId);
  if (!brand?.enabled) notFound();
  redirect('/portal');
}
