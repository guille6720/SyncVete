import type { OwnerAppBrand } from './owner-app';
import { ownerAppInstallUrl } from './owner-app-navigation';

/** Manifest URL sits in /portal/ so scope "/portal/" is valid for installation. */
export function ownerAppManifestPath(organizationId: string): string {
  return `/portal/brand.webmanifest?organizationId=${encodeURIComponent(organizationId)}`;
}

function isRasterIcon(url: string): boolean {
  return /^(https:\/\/|\/(?!\/)).+\.(png|jpe?g|webp)(\?.*)?$/i.test(url);
}

/**
 * Distinct installable app for pet owners. Identity, start URL and scope stay
 * under /portal/ so the home-screen icon does not open the clinic dashboard.
 */
export function buildOwnerAppManifest(organizationId: string, brand: OwnerAppBrand) {
  const icons: { src: string; sizes: string; type: string; purpose: 'any' }[] = [192, 512].map(
    (size) => ({
      src: `/portal/icon/${organizationId}?size=${size}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })
  );
  if (isRasterIcon(brand.logoUrl)) {
    icons.push({ src: brand.logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' });
  }
  return {
    id: `/portal/app/${organizationId}`,
    name: brand.appName,
    short_name: brand.appName.slice(0, 30),
    description: 'La app de tu veterinaria: mascotas, vacunas, tratamientos y turnos.',
    start_url: `${ownerAppInstallUrl(organizationId)}?source=pwa`,
    scope: '/portal/',
    display: 'standalone' as const,
    lang: 'es-AR',
    background_color: '#ffffff',
    theme_color: brand.primaryColor,
    icons,
  };
}
