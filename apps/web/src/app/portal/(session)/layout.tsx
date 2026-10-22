import { redirect } from 'next/navigation';
import { getSessionContext, signOut } from '@/actions/auth';
import { PortalShell } from '@/components/portal/portal-shell';
import { FEATURES, canUseFeature } from '@/lib/entitlements';
import { getOwnerAppBrand, signOutOwnerApp } from '@/actions/owner-app';
import { ownerAppMetadata } from '@/lib/owner-app-metadata';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSessionContext();
  if (!session || session.kind !== 'portal') return {};
  const brand = await getOwnerAppBrand(session.organizationId);
  if (!brand?.enabled) return {};
  return ownerAppMetadata(session.organizationId, brand);
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

  const brand = await getOwnerAppBrand(session.organizationId);
  const signOutAction = brand?.enabled ? signOutOwnerApp : signOut;

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

  if (session.portalPendingApproval) {
    return (
      <PortalShell userName={session.profile.full_name} signOutAction={signOutAction} brand={brand}>
        <div className="mx-auto max-w-lg space-y-3 rounded-lg border p-6">
          <h1 className="text-xl font-semibold">Cuenta creada</h1>
          <p className="text-sm text-muted-foreground">
            Tu veterinaria todavía tiene que activar el acceso. Cuando lo haga vas a poder ver tus
            mascotas, vacunas y turnos acá.
          </p>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      userName={session.profile.full_name}
      signOutAction={signOutAction}
      brand={brand}
    >
      {children}
    </PortalShell>
  );
}
