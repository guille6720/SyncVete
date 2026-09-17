import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function candidates() {
  return [
    path.join(process.cwd(), 'public/manual/manual-superadmin-syncvete.pdf'),
    path.join(process.cwd(), 'apps/web/public/manual/manual-superadmin-syncvete.pdf'),
  ];
}

export async function GET() {
  const session = await getSessionContext();
  if (!session?.isPlatformAdmin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let pdf: Buffer | null = null;
  for (const file of candidates()) {
    try {
      pdf = await readFile(file);
      break;
    } catch {
      /* try next */
    }
  }

  if (!pdf) {
    return NextResponse.json(
      { error: 'PDF Superadmin no disponible. Ejecutá npm run build:manual:superadmin.' },
      { status: 500 }
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Manual-Superadmin-SyncVete.pdf"',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
