import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionError } from '@/lib/permissions';
import { isPlanRestrictionError } from '@/lib/entitlements';
import { getSessionContext } from '@/lib/session';
import { loadClinicalHistoryReport, HistoryReportError } from '@/lib/clinical-history-report-data';
import { buildClinicalHistoryPdf } from '@/lib/clinical-history-pdf';
import { historyPdfFilename } from '@/lib/clinical-history-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request) {
  try {
    if (!(await getSessionContext()))
      return NextResponse.json(
        { error: 'Iniciá sesión para descargar la historia' },
        { status: 401, headers: privateHeaders }
      );
    const params = new URL(request.url).searchParams;
    const report = await loadClinicalHistoryReport({
      patientId: params.get('patientId') ?? '',
      date: params.get('date') ?? undefined,
    });
    const bytes = await buildClinicalHistoryPdf(report);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${historyPdfFilename(report)}"`,
      },
    });
  } catch (error) {
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof PermissionError || isPlanRestrictionError(error)
          ? 403
          : error instanceof HistoryReportError
            ? error.status
            : 500;
    const message =
      status === 400
        ? 'Paciente o fecha inválidos'
        : status === 403
          ? 'No tenés acceso a esta historia clínica'
          : status === 404
            ? 'Historia clínica no disponible'
            : 'No se pudo generar el PDF. Intentá nuevamente.';
    return NextResponse.json({ error: message }, { status, headers: privateHeaders });
  }
}
