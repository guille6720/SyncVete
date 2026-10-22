import { z } from 'zod';

const secureImage = z
  .string()
  .max(1000)
  .refine((value) => {
    if (!value) return true;
    if (value.includes('\\')) return false;
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  });
export const ownerAppBrandSchema = z.object({
  appName: z.string().trim().min(2).max(60),
  logoUrl: secureImage,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  welcomeText: z.string().trim().max(200),
  enabled: z.boolean(),
});
export type OwnerAppBrand = z.infer<typeof ownerAppBrandSchema>;

export function ownerAppTextColor(color: string): string {
  const components = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
  return luminance > 0.179 ? '#111827' : '#ffffff';
}

export function parseOwnerAppBrand(value: unknown, clinicName = 'Mi veterinaria'): OwnerAppBrand {
  const defaults = {
    appName: `app-${clinicName}`,
    logoUrl: '',
    primaryColor: '#16745c',
    welcomeText: '',
    enabled: false,
  };
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const parsed = ownerAppBrandSchema.safeParse(
    raw
      ? {
          ...raw,
          logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : '',
          welcomeText: typeof raw.welcomeText === 'string' ? raw.welcomeText : '',
        }
      : value
  );
  return parsed.success ? parsed.data : defaults;
}

/**
 * Owner PWA is on when OWNER_APP_ENABLED=true and the live Supabase URL is
 * explicitly pinned (staging and/or production). No pin → off.
 */
export function ownerAppEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.OWNER_APP_ENABLED !== 'true') return false;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  const allowed = new Set(
    [
      env.OWNER_APP_STAGING_SUPABASE_URL,
      env.OWNER_APP_PRODUCTION_SUPABASE_URL,
      env.OWNER_APP_SUPABASE_URL,
    ].filter((value): value is string => Boolean(value))
  );

  return allowed.has(supabaseUrl);
}

export function ownerAppUrl(organizationId: string): string {
  return `/portal/app/${encodeURIComponent(organizationId)}`;
}

export const ownerAppBookingSchema = z.object({
  slotId: z.string().uuid(),
  patientId: z.string().uuid(),
});
export const ownerAppSlotSchema = z.object({
  branchId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
});
