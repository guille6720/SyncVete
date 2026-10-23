import { NextResponse } from 'next/server';
import { ownerAppManifestPath } from '@/lib/owner-app-manifest';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** Older invitation pages linked this path. The installable manifest lives beside /portal/. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await params;
  if (!z.string().uuid().safeParse(organizationId).success) {
    return new Response(null, { status: 404 });
  }
  return NextResponse.redirect(new URL(ownerAppManifestPath(organizationId), request.url), 307);
}
