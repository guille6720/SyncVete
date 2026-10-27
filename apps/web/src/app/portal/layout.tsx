import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portal del tutor',
  description: 'La app de tu veterinaria: mascotas, vacunas, tratamientos y turnos.',
  applicationName: 'Portal del tutor',
  manifest: '/portal/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Portal del tutor',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/syncvete-192.png?v=brand-20261027', sizes: '192x192', type: 'image/png' },
      { url: '/icons/syncvete-512.png?v=brand-20261027', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png?v=brand-20261027', sizes: '180x180', type: 'image/png' }],
  },
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
