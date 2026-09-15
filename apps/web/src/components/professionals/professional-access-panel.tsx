'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  linkProfessionalUser,
  setProfessionalMembershipActive,
} from '@/actions/professionals';
import { inviteTeamMember } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type Role } from '@sincvete/shared';

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
  const [linkUserId, setLinkUserId] = useState(access.userId ?? '');

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

  const handleInvite = (formData: FormData) => {
    if (!canManageUsers) return;
    run(async () => {
      const result = await inviteTeamMember(null, formData);
      if (!result.success) {
        setError(result.error ?? 'No se pudo invitar');
        return;
      }
      setMessage(
        'Invitación enviada. Cuando acepte, vinculá el usuario desde esta pestaña.'
      );
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
            Vinculá un usuario del equipo o invitá por email (rol Veterinario). El reset de
            contraseña se hace desde Configuración → Equipo o “Recuperar contraseña”.
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
              Este profesional todavía no tiene usuario vinculado. Sin vínculo no podrá
              configurar agenda propia ni ver liquidaciones del portal.
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
        </CardContent>
      </Card>

      {canManageUsers && branches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitar nuevo usuario</CardTitle>
            <CardDescription>
              Crea una invitación al equipo (Veterinario). Después vinculá el usuario al
              profesional.
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
              <Button type="submit" disabled={pending}>
                {pending ? 'Invitando...' : 'Invitar como Veterinario'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
