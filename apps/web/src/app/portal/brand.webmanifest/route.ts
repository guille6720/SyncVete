import { NextResponse } from 'next/server';
import { getOwnerAppBrand } from '@/actions/owner-app';
import { buildOwnerAppManifest } from '@/lib/owner-app-manifest';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get('organizationId') ?? '';
  if (!z.string().uuid().safeParse(organizationId).success) {
    return new Response(null, { status: 404 });
  }
  const brand = await getOwnerAppBrand(organizationId);
  if (!brand?.enabled) return new Response(null, { status: 404 });
  return NextResponse.json(buildOwnerAppManifest(organizationId, brand), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-store',
    },
  });
}
