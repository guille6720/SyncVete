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
        flexDirection: 'column',
        gap: size / 16,
        fontSize: size / 6,
        fontWeight: 700,
      }}
    >
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="currentColor">
        <ellipse cx="5" cy="8" rx="2.5" ry="3" />
        <ellipse cx="10" cy="5" rx="2.5" ry="3" />
        <ellipse cx="16" cy="5" rx="2.5" ry="3" />
        <ellipse cx="21" cy="9" rx="2.5" ry="3" />
        <path d="M5 18c0-3 4-8 7-8s7 5 7 8c0 4-5 2-7 2s-7 2-7-2Z" />
      </svg>
      <span>{brand.appName.replace(/^app-/i, '').slice(0, 2).toUpperCase()}</span>
    </div>,
    { width: size, height: size, headers: { 'Cache-Control': 'no-store' } }
  );
}
