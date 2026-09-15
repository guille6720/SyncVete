import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SuperadminManual } from '@/components/manual/superadmin-manual';
import {
  SUPERADMIN_MANUAL_DOWNLOAD_HREF,
  SUPERADMIN_MANUAL_FILENAME,
  SUPERADMIN_MANUAL_PDF_HREF,
  SUPERADMIN_MANUAL_VIEW_HREF,
} from '@/components/manual/manual-constants';
import { MANUAL_CSS } from '@/components/manual/manual-css';

export function SettingsSuperadminManualPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Guía Superadmin (exclusiva)</CardTitle>
        <CardDescription>
          Solo la ves vos. Paso a paso de todas las funciones del panel, con capturas de referencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={SUPERADMIN_MANUAL_VIEW_HREF} target="_blank">
              Abrir manual completo
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={SUPERADMIN_MANUAL_PDF_HREF}>Descargar PDF</a>
          </Button>
          <Button variant="outline" asChild>
            <a href={SUPERADMIN_MANUAL_DOWNLOAD_HREF} download={SUPERADMIN_MANUAL_FILENAME}>
              Descargar HTML
            </a>
          </Button>
        </div>
        <style>{MANUAL_CSS}</style>
        <SuperadminManual />
      </CardContent>
    </Card>
  );
}
