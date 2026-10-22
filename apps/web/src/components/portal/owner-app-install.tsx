'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Download, PawPrint, CalendarDays, Syringe, HeartPulse, Share, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OwnerAppBrandMark } from './owner-app-brand';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { ownerAppTextColor, type OwnerAppBrand } from '@/lib/owner-app';

export function OwnerAppInstall({
  brand,
  clinicName,
  activationRequired = false,
  children,
}: {
  brand: OwnerAppBrand;
  clinicName?: string;
  /** Invite link: show create-account form as the only primary action. */
  activationRequired?: boolean;
  children: React.ReactNode;
}) {
  const { canInstallNative, install } = usePwaInstall();
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const update = () =>
      setInstalled(
        media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
      );
    update();
    media.addEventListener('change', update);
    window.addEventListener('appinstalled', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('appinstalled', update);
    };
  }, []);

  const clinicLabel = clinicName || brand.appName.replace(/^app-/i, 'Veterinaria ');

  return (
    <div
      className="min-h-dvh bg-[#f6f4fc] px-4 py-8 text-slate-900"
      style={
        {
          '--color-primary': brand.primaryColor,
          '--color-ring': brand.primaryColor,
          '--color-primary-foreground': ownerAppTextColor(brand.primaryColor),
        } as CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <OwnerAppBrandMark brand={brand} />
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: brand.primaryColor,
              color: ownerAppTextColor(brand.primaryColor),
            }}
          >
            <PawPrint size={34} />
          </div>
          <h1 className="text-3xl font-bold leading-tight">
            {activationRequired ? `Bienvenido a ${brand.appName}` : 'Tu mascota, siempre en buenas manos'}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {brand.welcomeText ||
              (activationRequired
                ? 'Creá tu cuenta para ver mascotas, vacunas, tratamientos y turnos.'
                : 'Toda la información de tus mascotas, cerca tuyo.')}
          </p>
          <p className="mt-2 text-sm font-medium">Solo para clientes de {clinicLabel}.</p>
          <div className="my-6 grid grid-cols-3 gap-2 text-center text-xs">
            {[
              { Icon: Syringe, label: 'Vacunas' },
              { Icon: HeartPulse, label: 'Tratamientos' },
              { Icon: CalendarDays, label: 'Turnos' },
            ].map(({ Icon, label }) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-3">
                <Icon className="mx-auto mb-2 h-6 w-6" style={{ color: brand.primaryColor }} />
                {label}
              </div>
            ))}
          </div>

          {activationRequired ? (
            <div id="owner-access" className="border-t border-slate-100 pt-5">
              {children}
            </div>
          ) : installed ? (
            <p className="flex items-center gap-2 text-sm">
              <Check size={18} /> Estás usando la app instalada.
            </p>
          ) : (
            <>
              <Button
                className="w-full rounded-xl"
                style={{
                  backgroundColor: brand.primaryColor,
                  color: ownerAppTextColor(brand.primaryColor),
                }}
                onClick={() => {
                  if (canInstallNative) void install();
                  else setShowSteps(true);
                }}
              >
                <Download size={18} /> Instalar {brand.appName}
              </Button>
              <p className="mt-3 text-xs text-slate-500">
                También podés continuar en el navegador sin instalar.
              </p>
            </>
          )}

          {!activationRequired && showSteps && (
            <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm" role="status">
              <p className="font-semibold">En iPhone, abrí el enlace en Safari</p>
              <p>
                <Share className="mr-1 inline h-4 w-4" /> Compartir → Agregar a inicio → Agregar.
              </p>
              <p className="font-semibold">En Android, abrilo en Chrome</p>
              <p>Menú ⋮ → Instalar aplicación o Agregar a pantalla de inicio → Confirmar.</p>
              <p className="text-xs text-slate-500">
                Si lo abriste desde WhatsApp, elegí abrir en el navegador.
              </p>
            </div>
          )}
        </section>

        {!activationRequired ? <div id="owner-access">{children}</div> : null}

        {activationRequired && installed ? (
          <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-950">
            Si esta pantalla se abrió dentro de la app de la clínica, cerrala y volvé a abrir el
            enlace en Chrome o Safari para usar la app del propietario.
          </p>
        ) : null}

        <p className="pb-4 text-center text-xs text-slate-500">Hecho por OpusOrg</p>
      </div>
    </div>
  );
}
