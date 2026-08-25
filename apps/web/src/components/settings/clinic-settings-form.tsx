'use client';

import { useActionState } from 'react';
import { updateOrganizationSettings } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  CURRENCIES,
  TIMEZONES,
  SETTLEMENT_PERIOD_PRESETS,
  SETTLEMENT_PERIOD_PRESET_LABELS,
  formatWaitingRoomRoomsText,
  type OrganizationSettings,
} from '@sincvete/shared';

interface ClinicSettingsFormProps {
  organizationName: string;
  settings: OrganizationSettings;
}

export function ClinicSettingsForm({ organizationName, settings }: ClinicSettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateOrganizationSettings, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de la clínica</CardTitle>
        <CardDescription>Información general y preferencias regionales</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la clínica</Label>
            <Input id="name" name="name" defaultValue={organizationName} required />
            {state?.fieldErrors?.name && (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone">Zona horaria</Label>
              <Select id="timezone" name="timezone" defaultValue={settings.timezone}>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Moneda</Label>
              <Select id="currency" name="currency" defaultValue={settings.currency ?? 'ARS'}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" defaultValue={settings.phone ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email de contacto</Label>
              <Input id="email" name="email" type="email" defaultValue={settings.email ?? ''} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="taxId">CUIT / Identificación fiscal</Label>
            <Input id="taxId" name="taxId" defaultValue={settings.taxId ?? ''} />
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Liquidaciones a profesionales</p>
            <p className="text-xs text-muted-foreground">
              Período por defecto al calcular liquidaciones (no es nómina legal).
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settlementPeriodPreset">Período por defecto</Label>
              <Select
                id="settlementPeriodPreset"
                name="settlementPeriodPreset"
                defaultValue={settings.settlementPeriodPreset ?? 'month'}
              >
                {SETTLEMENT_PERIOD_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {SETTLEMENT_PERIOD_PRESET_LABELS[preset]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settlementPeriodDays">Días (si usás “últimos N días”)</Label>
              <Input
                id="settlementPeriodDays"
                name="settlementPeriodDays"
                type="number"
                min={1}
                max={366}
                inputMode="numeric"
                defaultValue={
                  settings.settlementPeriodDays != null ? String(settings.settlementPeriodDays) : '14'
                }
                placeholder="14"
              />
            </div>
          </div>
          {state?.fieldErrors?.settlementPeriodDays && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.settlementPeriodDays[0]}
            </p>
          )}

          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Sala de espera</p>
            <p className="text-xs text-muted-foreground">
              Consultorios, ETA del portal y avisos a tutores.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waitingRoomRoomsText">Consultorios / boxes</Label>
            <textarea
              id="waitingRoomRoomsText"
              name="waitingRoomRoomsText"
              rows={3}
              defaultValue={formatWaitingRoomRoomsText(settings.waitingRoomRooms)}
              placeholder={'Consultorio 1\nBox A\nQuirófano'}
              className="flex min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Uno por línea. Se ofrecen al llamar pacientes desde la cola.
            </p>
            {state?.fieldErrors?.waitingRoomRoomsText && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.waitingRoomRoomsText[0]}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="waitingRoomMinutesPerPatient">
              Minutos por paciente (ETA portal)
            </Label>
            <Input
              id="waitingRoomMinutesPerPatient"
              name="waitingRoomMinutesPerPatient"
              type="number"
              min={1}
              max={120}
              inputMode="numeric"
              defaultValue={
                settings.waitingRoomMinutesPerPatient != null
                  ? String(settings.waitingRoomMinutesPerPatient)
                  : ''
              }
              placeholder="15"
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Si está vacío, el portal usa el promedio del día o 15 min por defecto.
            </p>
            {state?.fieldErrors?.waitingRoomMinutesPerPatient && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.waitingRoomMinutesPerPatient[0]}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <input
              id="waitingRoomPortalAlertsEnabled"
              name="waitingRoomPortalAlertsEnabled"
              type="checkbox"
              value="on"
              defaultChecked={settings.waitingRoomPortalAlertsEnabled !== false}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <div className="space-y-1">
              <Label htmlFor="waitingRoomPortalAlertsEnabled" className="cursor-pointer">
                Avisos en portal del tutor
              </Label>
              <p className="text-xs text-muted-foreground">
                Notifica al tutor cuando lo llaman, entra en consulta, debe pasar por recepción o
                completa la visita.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <input
              id="waitingRoomWhatsAppAutoEnabled"
              name="waitingRoomWhatsAppAutoEnabled"
              type="checkbox"
              value="on"
              defaultChecked={settings.waitingRoomWhatsAppAutoEnabled === true}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <div className="space-y-1">
              <Label htmlFor="waitingRoomWhatsAppAutoEnabled" className="cursor-pointer">
                WhatsApp automático al llamar / pago
              </Label>
              <p className="text-xs text-muted-foreground">
                Abre WhatsApp al confirmar llamado o pago pendiente, sin pedir confirmación extra.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <input
              id="waitingRoomBoardSoundEnabled"
              name="waitingRoomBoardSoundEnabled"
              type="checkbox"
              value="on"
              defaultChecked={settings.waitingRoomBoardSoundEnabled === true}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <div className="space-y-1">
              <Label htmlFor="waitingRoomBoardSoundEnabled" className="cursor-pointer">
                Sonido en recepción y tablero
              </Label>
              <p className="text-xs text-muted-foreground">
                Reproduce un tono en la cola de recepción y el tablero operativo cuando un paciente
                es llamado o pasa a pago pendiente (cada usuario puede silenciarlo localmente).
              </p>
            </div>
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && (
            <p className="text-sm text-emerald-600">Configuración guardada correctamente</p>
          )}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
