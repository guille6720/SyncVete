import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MANUAL_CSS } from '@/components/manual/manual-css';
import {
  SUPERADMIN_MANUAL_DOWNLOAD_HREF,
  SUPERADMIN_MANUAL_FILENAME,
  SUPERADMIN_MANUAL_PDF_HREF,
} from '@/components/manual/manual-constants';
import { PrintManualButton } from '@/components/manual/print-manual-button';
import { SuperadminManual } from '@/components/manual/superadmin-manual';
import { getSessionContext } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Manual Superadmin',
  description: 'Guía exclusiva de SyncVete Superadmin: planes, features, pagos y recomendaciones.',
};

export default async function SuperadminManualPage() {
  const session = await getSessionContext();
  if (!session?.isPlatformAdmin) redirect('/dashboard');

  return (
    <>
      <style>{MANUAL_CSS}</style>
      <SuperadminManual
        toolbar={
          <div className="sv-toolbar">
            <a className="primary" href={SUPERADMIN_MANUAL_PDF_HREF}>
              Descargar PDF
            </a>
            <a href={SUPERADMIN_MANUAL_DOWNLOAD_HREF} download={SUPERADMIN_MANUAL_FILENAME}>
              Descargar HTML
            </a>
            <PrintManualButton />
          </div>
        }
      />
    </>
  );
}
