'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createProfessionalOnboarding } from '@/actions/professionals';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  PROFESSIONAL_ACCESS_TEMPLATES,
  PROFESSIONAL_ACCESS_TEMPLATE_DEFAULT_SPECIALTY,
  PROFESSIONAL_ACCESS_TEMPLATE_HINTS,
  PROFESSIONAL_ACCESS_TEMPLATE_LABELS,
  PROFESSIONAL_RELATIONSHIP_TYPES,
  PROFESSIONAL_RELATIONSHIP_LABELS,
  type ProfessionalAccessTemplate,
} from '@sincvete/shared';

interface BranchOption {
  id: string;
  name: string;
}

interface ProfessionalCreateWizardProps {
  branches: BranchOption[];
  defaultBranchId?: string | null;
  canManageUsers: boolean;
}

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

function generatePassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function ProfessionalCreateWizard({
  branches,
  defaultBranchId,
  canManageUsers,
}: ProfessionalCreateWizardProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createProfessionalOnboarding, null);
  const [template, setTemplate] = useState<ProfessionalAccessTemplate>('veterinarian');
  const [specialty, setSpecialty] = useState(
    PROFESSIONAL_ACCESS_TEMPLATE_DEFAULT_SPECIALTY.veterinarian
  );
  const [createAccess, setCreateAccess] = useState(canManageUsers);
  const [passwordMode, setPasswordMode] = useState<'auto' | 'manual'>('auto');
  const [password, setPassword] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (passwordMode === 'auto' && !generatedPassword) {
      setGeneratedPassword(generatePassword());
    }
  }, [passwordMode, generatedPassword]);

  useEffect(() => {
    if (!state?.success || !state.data?.id) return;
    if (state.data.temporaryPassword) return;
    router.push(`/profesionales/${state.data.id}?tab=honorarios`);
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Datos del profesional</CardTitle>
          <CardDescription>Información laboral y de contacto</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-3xl gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellido</Label>
              <Input id="lastName" name="lastName" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="documentNumber">DNI</Label>
              <Input id="documentNumber" name="documentNumber" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="professionalLicense">Matrícula</Label>
              <Input id="professionalLicense" name="professionalLicense" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="accessTemplate">Perfil / especialidad</Label>
              <Select
                id="accessTemplate"
                name="accessTemplate"
                value={template}
                onChange={(event) => {
                  const next = event.target.value as ProfessionalAccessTemplate;
                  setTemplate(next);
                  setSpecialty(PROFESSIONAL_ACCESS_TEMPLATE_DEFAULT_SPECIALTY[next]);
                }}
              >
                {PROFESSIONAL_ACCESS_TEMPLATES.map((item) => (
                  <option key={item} value={item}>
                    {PROFESSIONAL_ACCESS_TEMPLATE_LABELS[item]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {PROFESSIONAL_ACCESS_TEMPLATE_HINTS[template]}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialty">Especialidad (texto)</Label>
              <Input
                id="specialty"
                name="specialty"
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="relationshipType">Relación</Label>
              <Select id="relationshipType" name="relationshipType" defaultValue="independent">
                {PROFESSIONAL_RELATIONSHIP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROFESSIONAL_RELATIONSHIP_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal principal</Label>
              <Select
                id="branchId"
                name="branchId"
                required
                defaultValue={defaultBranchId ?? branches[0]?.id}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email de contacto</Label>
              <Input id="email" name="email" type="email" placeholder="vet@clinica.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observaciones</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" value="true" defaultChecked />
            Profesional activo
          </label>
          {branches.map((branch) => (
            <input key={branch.id} type="hidden" name="branchIds" value={branch.id} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Usuario y contraseña</CardTitle>
          <CardDescription>
            Acceso a SyncVete. La contraseña se guarda hasheada en Auth (nunca en texto plano).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-3xl gap-4">
          {!canManageUsers ? (
            <>
              <input type="hidden" name="createPlatformAccess" value="false" />
              <p className="text-sm text-muted-foreground">
                No tenés permiso de Equipo (`users:manage`). Podés crear el profesional y vincular el
                acceso después desde la ficha.
              </p>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="createPlatformAccess"
                  value="true"
                  checked={createAccess}
                  onChange={(event) => setCreateAccess(event.target.checked)}
                />
                Crear acceso a la plataforma ahora
              </label>
              {createAccess ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="accessEmail">Email de acceso</Label>
                    <Input
                      id="accessEmail"
                      name="accessEmail"
                      type="email"
                      placeholder="Si está vacío, usa el email de contacto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordMode">Contraseña</Label>
                    <Select
                      id="passwordMode"
                      name="passwordMode"
                      value={passwordMode}
                      onChange={(event) => {
                        const mode = event.target.value as 'auto' | 'manual';
                        setPasswordMode(mode);
                        if (mode === 'auto') {
                          setGeneratedPassword(generatePassword());
                        }
                      }}
                    >
                      <option value="auto">Generar automáticamente</option>
                      <option value="manual">Definir manualmente</option>
                    </Select>
                  </div>
                  {passwordMode === 'manual' ? (
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña temporal</Label>
                      <Input
                        id="password"
                        name="password"
                        type="text"
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required={createAccess}
                      />
                    </div>
                  ) : (
                    <>
                      <input type="hidden" name="password" value={generatedPassword ?? ''} />
                      <div className="rounded-md border bg-muted/40 p-3 text-sm">
                        <p className="font-medium">Contraseña generada (copiála ahora)</p>
                        <p className="mt-1 font-mono tracking-wide">
                          {generatedPassword ?? 'Se genera al elegir esta opción'}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => setGeneratedPassword(generatePassword())}
                        >
                          Regenerar
                        </Button>
                      </div>
                    </>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="forcePasswordChange" value="true" defaultChecked />
                    Forzar cambio de contraseña en el próximo ingreso
                  </label>
                </>
              ) : (
                <input type="hidden" name="createPlatformAccess" value="false" />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Agenda inicial (opcional)</CardTitle>
          <CardDescription>
            Franjas semanales del profesional. Después podés ajustar bloqueos y horarios en la ficha.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-3xl gap-4">
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => {
              const checked = weekdays.includes(day.value);
              return (
                <label key={day.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scheduleWeekdays"
                    value={day.value}
                    checked={checked}
                    onChange={(event) => {
                      setWeekdays((current) =>
                        event.target.checked
                          ? [...current, day.value]
                          : current.filter((value) => value !== day.value)
                      );
                    }}
                  />
                  {day.label}
                </label>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="scheduleStartTime">Desde</Label>
              <Input id="scheduleStartTime" name="scheduleStartTime" type="time" defaultValue="09:00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduleEndTime">Hasta</Label>
              <Input id="scheduleEndTime" name="scheduleEndTime" type="time" defaultValue="18:00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduleSlotMinutes">Duración slot (min)</Label>
              <Select id="scheduleSlotMinutes" name="scheduleSlotMinutes" defaultValue="30">
                {[10, 15, 20, 30, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Después del alta</CardTitle>
          <CardDescription>
            Al guardar vas a la ficha del profesional para configurar honorarios y liquidaciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            • <strong>Honorarios:</strong> esquema (fijo / por consulta / porcentaje).
          </p>
          <p>
            • <strong>Liquidaciones:</strong> calculá un período cuando ya haya actividad clínica.
          </p>
          <p>
            • <strong>Agenda:</strong> bloqueos y más franjas desde la pestaña Agenda.
          </p>
          {state?.error ? <p className="text-destructive">{state.error}</p> : null}
          {state?.success && state.data?.temporaryPassword ? (
            <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p className="font-medium">Profesional creado. Copiá la contraseña temporal ahora:</p>
              <p className="font-mono text-base tracking-wide">{state.data.temporaryPassword}</p>
              <p className="text-xs opacity-80">
                No se vuelve a mostrar. Luego configurá honorarios y liquidaciones en la ficha.
              </p>
              <Button
                type="button"
                onClick={() => router.push(`/profesionales/${state.data!.id}?tab=honorarios`)}
              >
                Ir a honorarios y liquidaciones
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending ? 'Creando...' : 'Crear profesional'}
            </Button>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
