import { previewPortalInvite } from '@/actions/portal';
import { getSessionContext } from '@/actions/auth';
import { PortalActivateForm } from '@/components/portal/portal-activate-form';
import { getOwnerAppInviteBrand } from '@/actions/owner-app';
import { OwnerAppInstall } from '@/components/portal/owner-app-install';
import { ownerAppMetadata } from '@/lib/owner-app-metadata';
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
  return ownerAppMetadata(app.organizationId, app.brand);
}

export default async function PortalActivatePage({ searchParams }: PortalActivatePageProps) {
  const { token } = await searchParams;
  const inviteToken = token?.trim() ?? '';
  const [preview, session] = await Promise.all([
    inviteToken ? previewPortalInvite(inviteToken) : Promise.resolve(null),
    getSessionContext(),
  ]);
  const app = inviteToken ? await getOwnerAppInviteBrand(inviteToken) : null;

  const form = (
    <PortalActivateForm
      token={inviteToken}
      preview={preview}
      isLoggedIn={Boolean(session)}
      isStaff={session?.kind === 'staff'}
      brand={app?.brand}
    />
  );
  if (app)
    return (
      <OwnerAppInstall brand={app.brand} clinicName={preview?.clinicName} activationRequired>
        {form}
      </OwnerAppInstall>
    );
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">{form}</div>
  );
}
