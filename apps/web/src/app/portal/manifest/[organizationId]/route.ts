import { NextResponse } from 'next/server';
import { getOwnerAppBrand } from '@/actions/owner-app';
import { ownerAppUrl } from '@/lib/owner-app';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await params;
  if (!z.string().uuid().safeParse(organizationId).success)
    return new Response(null, { status: 404 });
  const brand = await getOwnerAppBrand(organizationId);
  if (!brand?.enabled) return new Response(null, { status: 404 });
  return NextResponse.json(
    {
      id: ownerAppUrl(organizationId),
      name: brand.appName,
      short_name: brand.appName.slice(0, 30),
      start_url: ownerAppUrl(organizationId),
      scope: '/portal/',
      display: 'standalone',
      lang: 'es-AR',
      theme_color: brand.primaryColor,
      background_color: '#ffffff',
      icons: [192, 512].map((size) => ({
        src: brand.logoUrl || `/portal/icon/${organizationId}?size=${size}`,
        sizes: brand.logoUrl ? 'any' : `${size}x${size}`,
        purpose: 'any',
      })),
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } }
  );
}
