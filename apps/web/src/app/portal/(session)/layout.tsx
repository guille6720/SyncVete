import { redirect } from 'next/navigation';
import { getSessionContext, signOut } from '@/actions/auth';
import { PortalShell } from '@/components/portal/portal-shell';
import { FEATURES, canUseFeature } from '@/lib/entitlements';
import { getOwnerAppBrand } from '@/actions/owner-app';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSessionContext();
  if (!session || session.kind !== 'portal') return {};
  const brand = await getOwnerAppBrand(session.organizationId);
  if (!brand?.enabled) return {};
  return {
    title: brand.appName,
    applicationName: brand.appName,
    manifest: `/portal/manifest/${session.organizationId}`,
    appleWebApp: { capable: true, title: brand.appName },
    icons: { apple: [{ url: brand.logoUrl || `/portal/icon/${session.organizationId}?size=180` }] },
  };
}

export default async function PortalSessionLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();

  if (!session) {
    redirect('/login');
  }

  if (session.kind !== 'portal') {
    redirect('/dashboard');
  }

  const allowed = await canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.OWNER_PORTAL,
  });

  if (!allowed) {
    return (
      <PortalShell userName={session.profile.full_name} signOutAction={signOut}>
        <div className="mx-auto max-w-lg space-y-3 rounded-lg border p-6">
          <h1 className="text-xl font-semibold">Portal no disponible</h1>
          <p className="text-sm text-muted-foreground">
            La clínica no tiene el portal del tutor en su plan. Pedile al equipo que lo habilite o
            que te envíe la información por otro medio.
          </p>
        </div>
      </PortalShell>
    );
  }

  const brand = await getOwnerAppBrand(session.organizationId);

  return (
    <PortalShell userName={session.profile.full_name} signOutAction={signOut} brand={brand}>
      {children}
    </PortalShell>
  );
}
