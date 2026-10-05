import { previewPortalInvite } from '@/actions/portal';
import { getSessionContext } from '@/actions/auth';
import { PortalActivateForm } from '@/components/portal/portal-activate-form';
import { getOwnerAppInviteBrand } from '@/actions/owner-app';
import { OwnerAppBrandMark } from '@/components/portal/owner-app-brand';
import type { Metadata } from 'next';

interface PortalActivatePageProps {
  searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({
  searchParams,
}: PortalActivatePageProps): Promise<Metadata> {
  const { token } = await searchParams;
  const app = token ? await getOwnerAppInviteBrand(token) : null;
  if (!app) return { robots: { index: false, follow: false } };
  return {
    title: app.brand.appName,
    applicationName: app.brand.appName,
    manifest: `/portal/manifest/${app.organizationId}`,
    appleWebApp: { capable: true, title: app.brand.appName },
    icons: { apple: [{ url: app.brand.logoUrl || `/portal/icon/${app.organizationId}?size=180` }] },
    robots: { index: false, follow: false },
  };
}

export default async function PortalActivatePage({ searchParams }: PortalActivatePageProps) {
  const { token } = await searchParams;
  const inviteToken = token?.trim() ?? '';
  const [preview, session] = await Promise.all([
    inviteToken ? previewPortalInvite(inviteToken) : Promise.resolve(null),
    getSessionContext(),
  ]);
  const app = inviteToken ? await getOwnerAppInviteBrand(inviteToken) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted/30 p-4">
      {app && <OwnerAppBrandMark brand={app.brand} />}
      <PortalActivateForm
        token={inviteToken}
        preview={preview}
        isLoggedIn={Boolean(session)}
        isStaff={session?.kind === 'staff'}
      />
      {app && <p className="text-xs text-muted-foreground">Hecho por OpusOrg</p>}
    </div>
  );
}
