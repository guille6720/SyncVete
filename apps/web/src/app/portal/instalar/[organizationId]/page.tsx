import { notFound } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { getOwnerAppBrand } from '@/actions/owner-app';
import { getSessionContext } from '@/actions/auth';
import { OwnerAppInstall } from '@/components/portal/owner-app-install';
import { LoginForm } from '@/components/auth/login-form';
import { ownerAppMetadata } from '@/lib/owner-app-metadata';
import { ownerAppUrl } from '@/lib/owner-app';
import type { Metadata } from 'next';

type Props = { params: Promise<{ organizationId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { organizationId } = await params;
  if (!z.string().uuid().safeParse(organizationId).success) return {};
  const brand = await getOwnerAppBrand(organizationId);
  return brand?.enabled
    ? ownerAppMetadata(organizationId, brand)
    : { robots: { index: false, follow: false } };
}
export default async function OwnerAppInstallPage({ params }: Props) {
  const { organizationId } = await params;
  if (!z.string().uuid().safeParse(organizationId).success) notFound();
  const [brand, session] = await Promise.all([
    getOwnerAppBrand(organizationId),
    getSessionContext(),
  ]);
  if (!brand?.enabled) notFound();
  const ownSession = session?.kind === 'portal' && session.organizationId === organizationId;
  return (
    <OwnerAppInstall brand={brand}>
      {ownSession ? (
        <Link
          className="rounded-2xl bg-white p-4 text-center font-semibold shadow-sm"
          href={ownerAppUrl(organizationId)}
        >
          Continuar en la app
        </Link>
      ) : session ? (
        <p className="rounded-2xl bg-white p-5 text-sm">
          Esta sesión pertenece a otra cuenta. Cerrá la sesión antes de ingresar con tu acceso de
          propietario.
        </p>
      ) : (
        <LoginForm brand={brand} redirectTo={ownerAppUrl(organizationId)} />
      )}
    </OwnerAppInstall>
  );
}
