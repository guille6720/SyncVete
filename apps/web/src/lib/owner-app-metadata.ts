import type { Metadata } from 'next';
import type { OwnerAppBrand } from './owner-app';

export function ownerAppMetadata(organizationId: string, brand: OwnerAppBrand): Metadata {
  const icon = brand.logoUrl || `/portal/icon/${organizationId}?size=192`;
  return {
    title: brand.appName,
    description: 'La app de tu veterinaria: mascotas, vacunas, tratamientos y turnos.',
    applicationName: brand.appName,
    manifest: `/portal/manifest/${organizationId}`,
    appleWebApp: { capable: true, title: brand.appName, statusBarStyle: 'default' },
    icons: {
      icon: [{ url: icon }],
      apple: [{ url: brand.logoUrl || `/portal/icon/${organizationId}?size=180` }],
    },
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
