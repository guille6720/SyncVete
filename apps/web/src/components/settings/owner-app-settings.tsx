'use client';

import { useActionState } from 'react';
import { Save, CalendarPlus } from 'lucide-react';
import { saveOwnerAppBrand, publishOwnerAppSlot } from '@/actions/owner-app';
import type { OwnerAppBrand } from '@/lib/owner-app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function OwnerAppSettings({
  brand,
  branchId,
}: {
  brand: OwnerAppBrand;
  branchId: string | null;
}) {
  const [state, action, pending] = useActionState(saveOwnerAppBrand, null);
  const [slotState, slotAction, slotPending] = useActionState(publishOwnerAppSlot, null);
  return (
    <section className="space-y-5 border-t pt-6">
      <h2 className="text-lg font-semibold">App de propietarios</h2>
      <form action={action} className="grid max-w-xl gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={brand.enabled} /> Habilitar app
        </label>
        <div>
          <Label htmlFor="appName">Nombre de la app</Label>
          <Input id="appName" name="appName" defaultValue={brand.appName} maxLength={60} required />
        </div>
        <div>
          <Label htmlFor="logoUrl">Logo (URL HTTPS o ruta local)</Label>
          <Input id="logoUrl" name="logoUrl" defaultValue={brand.logoUrl} />
        </div>
        <div>
          <Label htmlFor="primaryColor">Color principal</Label>
          <input
            className="block h-10 w-16"
            type="color"
            name="primaryColor"
            id="primaryColor"
            defaultValue={brand.primaryColor}
          />
        </div>
        <div>
          <Label htmlFor="welcomeText">Bienvenida</Label>
          <Input
            id="welcomeText"
            name="welcomeText"
            defaultValue={brand.welcomeText}
            maxLength={200}
          />
        </div>
        <Button type="submit" disabled={pending}>
          <Save size={16} />
          {pending ? 'Guardando...' : 'Guardar app'}
        </Button>
        {state && (
          <p role="status" className="text-sm">
            {state.success ? 'Configuracion guardada' : state.error}
          </p>
        )}
      </form>
      {branchId && (
        <form
          action={slotAction}
          className="grid max-w-xl gap-3"
          onSubmit={(event) => {
            const form = event.currentTarget;
            const local = (form.elements.namedItem('localTime') as HTMLInputElement).value;
            (form.elements.namedItem('startsAt') as HTMLInputElement).value = new Date(
              local
            ).toISOString();
          }}
        >
          <h3 className="font-medium">Publicar turno de 30 minutos</h3>
          <input name="branchId" type="hidden" value={branchId} />
          <input name="startsAt" type="hidden" />
          <Label htmlFor="localTime">Fecha y hora (hora de este dispositivo)</Label>
          <Input id="localTime" name="localTime" type="datetime-local" required />
          <Button type="submit" variant="outline" disabled={slotPending}>
            <CalendarPlus size={16} />
            Publicar horario
          </Button>
          {slotState && (
            <p role="status" className="text-sm">
              {slotState.success ? 'Horario publicado' : slotState.error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
