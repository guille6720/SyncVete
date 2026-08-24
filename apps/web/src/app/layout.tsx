import type { Metadata, Viewport } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import { Providers } from '@/components/providers';
import { PwaRegister } from '@/components/pwa-register';
import { InstallAppPrompt } from '@/components/pwa/install-app-prompt';
import { APP_NAME } from '@sincvete/shared';
import { AUTH_RECOVERY_REDIRECT_SCRIPT } from '@/lib/auth/recovery-redirect';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://syncvete.opusorg.com'),
  title: APP_NAME,
  description: 'Gestión veterinaria para clínicas y profesionales.',
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/syncvete-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/syncvete.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#3f6b4a' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1714' },
  ],
};

const themeBootScript = `(function(){try{var raw=localStorage.getItem('syncvete-theme')||localStorage.getItem('sincvete-theme');var prefs=raw?JSON.parse(raw):{mode:'light',accent:'teal'};var mode=prefs.mode==='dark'?'dark':'light';var accent=typeof prefs.accent==='string'?prefs.accent:'teal';var root=document.documentElement;if(mode==='dark')root.classList.add('dark');else root.classList.remove('dark');root.setAttribute('data-accent',accent);root.style.colorScheme=mode;}catch(e){document.documentElement.setAttribute('data-accent','teal');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: AUTH_RECOVERY_REDIRECT_SCRIPT }} />
      </head>
      <body className={`${dmSans.variable} ${fraunces.variable} font-sans antialiased`}>
        <Providers>
          <PwaRegister />
          <InstallAppPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}
