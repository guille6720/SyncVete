'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  linkProfessionalUser,
  provisionProfessionalAccess,
  setProfessionalMembershipActive,
} from '@/actions/professionals';
import { inviteTeamMember } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  PROFESSIONAL_ACCESS_TEMPLATES,
  PROFESSIONAL_ACCESS_TEMPLATE_HINTS,
  PROFESSIONAL_ACCESS_TEMPLATE_LABELS,
  ROLE_LABELS,
  type ProfessionalAccessTemplate,
  type Role,
} from '@sincvete/shared';

interface StaffOption {
  userId: string;
  fullName: string;
}

interface BranchOption {
  id: string;
  name: string;
}

interface AccessState {
  userId: string | null;
  membershipId: string | null;
  role: string | null;
  isActive: boolean | null;
  email: string | null;
  fullName: string | null;
}

interface ProfessionalAccessPanelProps {
  professionalId: string;
  access: AccessState;
  staff: StaffOption[];
  branches: BranchOption[];
  defaultBranchId?: string | null;
  canWrite: boolean;
  canManageUsers: boolean;
}

function generatePassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function ProfessionalAccessPanel({
  professionalId,
  access,
  staff,
  branches,
  defaultBranchId,
  canWrite,
  canManageUsers,
}: ProfessionalAccessPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shownPassword, setShownPassword] = useState<string | null>(null);
  const [linkUserId, setLinkUserId] = useState(access.userId ?? '');
  const [template, setTemplate] = useState<ProfessionalAccessTemplate>('veterinarian');
  const [passwordMode, setPasswordMode] = useState<'auto' | 'manual'>('auto');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [manualPassword, setManualPassword] = useState('');

  useEffect(() => {
    if (passwordMode === 'auto' && !generatedPassword) {
      setGeneratedPassword(generatePassword());
    }
  }, [passwordMode, generatedPassword]);

  const run = (fn: () => Promise<void>) => {
    startTransition(() => {
      void (async () => {
        setError(null);
        setMessage(null);
        try {
          await fn();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Error inesperado');
        }
      })();
    });
  };

  const handleLink = () => {
    if (!canWrite) return;
    run(async () => {
      const result = await linkProfessionalUser(professionalId, linkUserId || null);
      if (!result.success) {
        setError(result.error ?? 'No se pudo vincular');
        return;
      }
      setMessage(linkUserId ? 'Usuario vinculado' : 'Usuario desvinculado');
    });
  };

  const handleProvision = (formData: FormData) => {
    if (!canManageUsers) return;
    run(async () => {
      const result = await provisionProfessionalAccess(professionalId, formData);
      if (!result.success) {
        setError(result.error ?? 'No se pudo crear el acceso');
        return;
      }
      if (result.data?.temporaryPassword) {
        setShownPassword(result.data.temporaryPassword);
        setMessage('Acceso creado y vinculado. Copiá la contraseña ahora (no se vuelve a mostrar).');
      } else {
        setShownPassword(null);
        setMessage('Usuario existente agregado al equipo y vinculado al profesional.');
      }
    });
  };

  const handleInvite = (formData: FormData) => {
    if (!canManageUsers) return;
    run(async () => {
      const result = await inviteTeamMember(null, formData);
      if (!result.success) {
        setError(result.error ?? 'No se pudo invitar');
        return;
      }
      if (result.data?.userId) {
        const link = await linkProfessionalUser(professionalId, result.data.userId);
        if (!link.success) {
          setError(
            result.data.mode === 'existing_added'
              ? 'Se agregó al equipo, pero no se pudo vincular al profesional. Usá “Guardar vínculo”.'
              : 'Invitación ok, pero no se pudo vincular. Usá “Guardar vínculo”.'
          );
          return;
        }
      }
      if (result.data?.mode === 'existing_added') {
        setMessage(
          'Ese email ya tenía cuenta: se agregó al equipo y se vinculó. No se envía mail. Ya puede iniciar sesión con su contraseña actual.'
        );
      } else {
        setMessage(
          'Usuario creado y vinculado. Si el mail de Supabase no llega, usá “Crear acceso con contraseña” o Recuperar contraseña.'
        );
      }
    });
  };

  const handleToggleAccess = (isActive: boolean) => {
    if (!access.membershipId || !canManageUsers) return;
    run(async () => {
      const result = await setProfessionalMembershipActive(access.membershipId!, isActive);
      if (!result.success) {
        setError(result.error ?? 'No se pudo actualizar el acceso');
        return;
      }
      setMessage(isActive ? 'Acceso reactivado' : 'Acceso desactivado');
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Acceso a SyncVete</CardTitle>
          <CardDescription>
            Preferí crear usuario y contraseña acá (sin depender del mail). El reset también está en
            Recuperar contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {access.userId ? (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Usuario: </span>
                {access.fullName ?? access.userId}
              </p>
              {access.role ? (
                <p>
                  <span className="text-muted-foreground">Rol: </span>
                  {ROLE_LABELS[access.role as Role] ?? access.role}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Estado:</span>
                {access.isActive == null ? (
                  <Badge>Sin membresía</Badge>
                ) : access.isActive ? (
                  <Badge variant="success">Activo</Badge>
                ) : (
                  <Badge variant="destructive">Desactivado</Badge>
                )}
              </div>
              {access.membershipId && canManageUsers ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {access.isActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleToggleAccess(false)}
                    >
                      Desactivar acceso
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleToggleAccess(true)}
                    >
                      Reactivar acceso
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" asChild>
                    <Link href="/configuracion?tab=equipo">Ir a Equipo</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este profesional todavía no tiene usuario vinculado. Sin vínculo no podrá configurar
              agenda propia ni ver liquidaciones del portal.
            </p>
          )}

          {canWrite ? (
            <div className="grid max-w-xl gap-3">
              <div className="space-y-2">
                <Label htmlFor="linkUserId">Vincular usuario existente</Label>
                <Select
                  id="linkUserId"
                  value={linkUserId}
                  onChange={(event) => setLinkUserId(event.target.value)}
                >
                  <option value="">Sin vincular</option>
                  {staff.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="button" disabled={pending} onClick={handleLink}>
                {pending ? 'Guardando...' : 'Guardar vínculo'}
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {shownPassword ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p className="font-medium">Contraseña temporal</p>
              <p className="mt-1 font-mono text-base tracking-wide">{shownPassword}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canManageUsers && !access.userId && branches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Crear acceso con contraseña</CardTitle>
            <CardDescription>
              Crea el usuario, lo agrega al equipo y lo vincula al profesional. No necesita mail de
              invitación.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleProvision} className="grid max-w-xl gap-3">
              <div className="space-y-2">
                <Label htmlFor="accessEmail">Email de acceso</Label>
                <Input
                  id="accessEmail"
                  name="accessEmail"
                  type="email"
                  required
                  defaultValue={access.email ?? ''}
                  placeholder="vet@clinica.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessTemplate">Perfil / permisos</Label>
                <Select
                  id="accessTemplate"
                  name="accessTemplate"
                  value={template}
                  onChange={(event) =>
                    setTemplate(event.target.value as ProfessionalAccessTemplate)
                  }
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
                <Label htmlFor="branchId">Sucursal</Label>
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
              <div className="space-y-2">
                <Label htmlFor="passwordMode">Contraseña</Label>
                <Select
                  id="passwordMode"
                  name="passwordMode"
                  value={passwordMode}
                  onChange={(event) => {
                    const mode = event.target.value as 'auto' | 'manual';
                    setPasswordMode(mode);
                    if (mode === 'auto') setGeneratedPassword(generatePassword());
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
                    required
                    value={manualPassword}
                    onChange={(event) => setManualPassword(event.target.value)}
                  />
                </div>
              ) : (
                <>
                  <input type="hidden" name="password" value={generatedPassword} />
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p className="font-medium">Contraseña generada</p>
                    <p className="mt-1 font-mono tracking-wide">{generatedPassword}</p>
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
              <Button type="submit" disabled={pending}>
                {pending ? 'Creando...' : 'Crear acceso y vincular'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {canManageUsers && branches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitar por email (opcional)</CardTitle>
            <CardDescription>
              Depende del SMTP de Supabase. Si el mail no llega, usá crear acceso con contraseña
              arriba.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleInvite} className="grid max-w-xl gap-3">
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">Email</Label>
                <Input
                  id="inviteEmail"
                  name="email"
                  type="email"
                  required
                  defaultValue={access.email ?? ''}
                  placeholder="vet@clinica.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inviteBranch">Sucursal</Label>
                <Select
                  id="inviteBranch"
                  name="branchId"
                  defaultValue={defaultBranchId ?? branches[0]?.id}
                  required
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </div>
              <input type="hidden" name="role" value="veterinarian" />
              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? 'Invitando...' : 'Invitar como Veterinario'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
