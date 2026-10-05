import { ImageResponse } from 'next/og';
import { getOwnerAppBrand } from '@/actions/owner-app';
import { z } from 'zod';
import { ownerAppTextColor } from '@/lib/owner-app';

export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await params;
  if (!z.string().uuid().safeParse(organizationId).success)
    return new Response(null, { status: 404 });
  const brand = await getOwnerAppBrand(organizationId);
  if (!brand?.enabled) return new Response(null, { status: 404 });
  const requested = Number(new URL(request.url).searchParams.get('size'));
  const size = [180, 192, 512].includes(requested) ? requested : 192;
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: brand.primaryColor,
        color: ownerAppTextColor(brand.primaryColor),
        fontSize: size / 3,
        fontWeight: 700,
      }}
    >
      {brand.appName.replace(/^app-/i, '').slice(0, 2).toUpperCase()}
    </div>,
    { width: size, height: size, headers: { 'Cache-Control': 'no-store' } }
  );
}
