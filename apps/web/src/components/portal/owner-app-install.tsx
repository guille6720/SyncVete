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
          <h1 className="text-3xl font-bold leading-tight">Tu mascota, siempre en buenas manos</h1>
          <p className="mt-3 text-sm text-slate-600">
            {brand.welcomeText || 'Toda la información de tus mascotas, cerca tuyo.'}
          </p>
          <p className="mt-2 text-sm font-medium">
            Solo para clientes de {clinicName || brand.appName.replace(/^app-/i, 'Veterinaria ')}.
          </p>
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
            <Button
              className="w-full rounded-xl"
              onClick={() =>
                document.getElementById('owner-access')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Activar mi acceso
            </Button>
          ) : installed ? (
            <p className="flex items-center gap-2 text-sm">
              <Check size={18} /> Estás usando la app instalada.
            </p>
          ) : (
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
          )}
          <p className="mt-3 text-xs text-slate-500">
            Primero activá tu acceso con la invitación de la veterinaria. Después podrás ingresar
            desde el ícono de tu celular.
          </p>
          {showSteps && (
            <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm" role="status">
              <p className="font-semibold">En iPhone, abrí el enlace en Safari</p>
              <p>
                <Share className="mr-1 inline h-4 w-4" /> Compartir → Agregar a inicio → Agregar.
              </p>
              <p className="font-semibold">En Android, abrilo en Chrome</p>
              <p>Menú ⋮ → Instalar aplicación o Agregar a pantalla de inicio → Confirmar.</p>
              <p className="text-xs text-slate-500">
                Si lo abriste desde WhatsApp, elegí abrir en el navegador. También podés continuar
                sin instalar.
              </p>
            </div>
          )}
        </section>
        <div id="owner-access" className="scroll-mt-6">
          {children}
        </div>
        <p className="pb-4 text-center text-xs text-slate-500">Hecho por OpusOrg</p>
      </div>
    </div>
  );
}
