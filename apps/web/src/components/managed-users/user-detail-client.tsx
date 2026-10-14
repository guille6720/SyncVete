'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  INVITABLE_ROLES,
  type AccountStatus,
  type ManagedUserAccess,
  type ManagedUserRow,
  type PaginatedResult,
  type Permission,
  type Role,
  type UserActivityRow,
} from '@sincvete/shared';
import {
  revokeManagedUserSessions,
  setManagedUserPermissions,
  setManagedUserStatus,
  updateManagedUser,
} from '@/actions/managed-users';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ActivityExplorer } from '@/components/managed-users/activity-explorer';
import { PermissionMatrix } from '@/components/managed-users/permission-matrix';
import {
  UserStatusBadge,
  formatDateTime,
  managedRoleLabel,
} from '@/components/managed-users/shared';

type Tab = 'general' | 'permisos' | 'actividad';

interface UserDetailClientProps {
  user: ManagedUserRow;
  access: ManagedUserAccess;
  branches: Array<{ id: string; name: string }>;
  isSelf: boolean;
  currentUserIsCentralAdmin: boolean;
  actorPermissions: Permission[];
  activity: PaginatedResult<UserActivityRow> | null;
}

const STATUS_ACTIONS: Record<
  AccountStatus,
  { title: string; description: string; confirm: string; destructive: boolean }
> = {
  active: {
    title: 'Reactivar usuario',
    description: 'El usuario podrá volver a ingresar con sus permisos actuales. Ocupa un cupo.',
    confirm: 'Reactivar',
    destructive: false,
  },
  suspended: {
    title: 'Suspender usuario',
    description:
      'El usuario no podrá ingresar ni operar hasta que lo reactives. Sus datos y permisos se conservan.',
    confirm: 'Suspender',
    destructive: true,
  },
  disabled: {
    title: 'Deshabilitar usuario',
    description:
      'Se cierran todas sus sesiones y pierde el acceso. Libera un cupo. Podés reactivarlo más adelante.',
    confirm: 'Deshabilitar',
    destructive: true,
  },
};

export function UserDetailClient({
  user,
  access,
  branches,
  isSelf,
  currentUserIsCentralAdmin,
  actorPermissions,
  activity,
}: UserDetailClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('general');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const locked = isSelf || (user.isCentralAdmin && !currentUserIsCentralAdmin);
  const lockReason = isSelf
    ? 'No podés modificar tu propio usuario, rol, estado ni permisos.'
    : locked
      ? 'Solo un administrador central puede modificar a otro administrador central.'
      : null;

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [branchId, setBranchId] = useState(user.branchId ?? branches[0]?.id ?? '');
  const [denied, setDenied] = useState<string[]>(user.deniedPermissions);
  const [statusTarget, setStatusTarget] = useState<AccountStatus | null>(null);
  const [reason, setReason] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmOwner, setConfirmOwner] = useState(false);

  const roleOptions: Role[] = currentUserIsCentralAdmin
    ? ['owner', ...INVITABLE_ROLES]
    : user.role === 'owner'
      ? ['owner']
      : INVITABLE_ROLES;

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, okText: string) => {
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      setNotice(
        result.success
          ? { kind: 'ok', text: okText }
          : { kind: 'error', text: result.error ?? 'No se pudo completar la acción' }
      );
      if (result.success) router.refresh();
    });
  };

  const saveGeneral = () =>
    run(
      () => updateManagedUser({ userId: user.userId, fullName, phone, role, branchId }),
      'Datos actualizados.'
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/configuracion/usuarios" className="text-sm text-muted-foreground hover:underline">
            ← Usuarios y permisos
          </Link>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{user.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {user.email ?? '—'} · {managedRoleLabel(user.role)}
          </p>
        </div>
        <UserStatusBadge status={user.status} />
      </div>

      {lockReason ? (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">{lockReason}</p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b">
        {(
          [
            ['general', 'General'],
            ['permisos', 'Permisos'],
            ...(activity ? ([['actividad', 'Actividad']] as const) : []),
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datos y rol</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (role === 'owner' && user.role !== 'owner') setConfirmOwner(true);
                  else saveGeneral();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="ud-name">Nombre completo</Label>
                  <Input id="ud-name" value={fullName} disabled={locked} minLength={2} maxLength={200} required onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ud-phone">Teléfono</Label>
                  <Input id="ud-phone" type="tel" value={phone} disabled={locked} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ud-role">Rol</Label>
                    <Select id="ud-role" value={role} disabled={locked} onChange={(e) => setRole(e.target.value as Role)}>
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {managedRoleLabel(r)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ud-branch">Sucursal</Label>
                    <Select id="ud-branch" value={branchId} disabled={locked} onChange={(e) => setBranchId(e.target.value)}>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                {!locked ? (
                  <Button type="submit" isPending={pending}>
                    Guardar cambios
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Estado de la cuenta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <UserStatusBadge status={user.status} />
                  {user.statusChangedAt ? (
                    <span className="text-muted-foreground">desde {formatDateTime(user.statusChangedAt)}</span>
                  ) : null}
                </div>
                {user.statusReason ? <p className="text-muted-foreground">Motivo: {user.statusReason}</p> : null}
                {!locked ? (
                  <div className="flex flex-wrap gap-2">
                    {user.status !== 'active' ? (
                      <Button size="sm" onClick={() => setStatusTarget('active')}>
                        Reactivar
                      </Button>
                    ) : null}
                    {user.status === 'active' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatusTarget('suspended')}>
                        Suspender
                      </Button>
                    ) : null}
                    {user.status !== 'disabled' ? (
                      <Button size="sm" variant="destructive" onClick={() => setStatusTarget('disabled')}>
                        Deshabilitar
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Accesos y sesiones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  Último inicio de sesión:{' '}
                  <span className="font-medium">{formatDateTime(access.lastSignInAt)}</span>
                </p>
                <p>
                  Última actividad registrada:{' '}
                  <span className="font-medium">{formatDateTime(user.lastActivityAt)}</span>
                </p>
                {access.sessions.length === 0 ? (
                  <p className="text-muted-foreground">Sin sesiones abiertas.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {access.sessions.map((session, index) => (
                      <li key={`${session.createdAt}-${index}`} className="px-3 py-2">
                        <p className="font-medium">{session.device}</p>
                        <p className="text-xs text-muted-foreground">
                          Inició {formatDateTime(session.createdAt)} · última actividad{' '}
                          {formatDateTime(session.lastActiveAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {!locked ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={access.sessions.length === 0}
                    onClick={() => setConfirmRevoke(true)}
                  >
                    Revocar acceso (cerrar sesiones)
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'permisos' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Permisos de {managedRoleLabel(user.role)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.role === 'owner' ? (
              <p className="text-sm text-muted-foreground">
                El administrador central tiene acceso total y sus permisos no se pueden restringir.
              </p>
            ) : (
              <>
                <PermissionMatrix
                  role={user.role}
                  denied={denied}
                  onChange={setDenied}
                  actorPermissions={actorPermissions}
                  readOnly={locked}
                />
                {!locked ? (
                  <Button
                    isPending={pending}
                    onClick={() =>
                      run(
                        () => setManagedUserPermissions(user.userId, denied),
                        'Permisos actualizados. Se aplican en el próximo request del usuario.'
                      )
                    }
                  >
                    Guardar permisos
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'actividad' && activity ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityExplorer initial={activity} fixedUserId={user.userId} />
          </CardContent>
        </Card>
      ) : null}

      <ModalShell
        open={statusTarget !== null}
        titleId="status-change-title"
        title={statusTarget ? STATUS_ACTIONS[statusTarget].title : ''}
        description={statusTarget ? STATUS_ACTIONS[statusTarget].description : undefined}
        onClose={() => setStatusTarget(null)}
      >
        <div className="mt-4 space-y-3">
          {statusTarget !== 'active' ? (
            <div className="space-y-2">
              <Label htmlFor="status-reason">Motivo (opcional)</Label>
              <Textarea
                id="status-reason"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant={statusTarget && STATUS_ACTIONS[statusTarget].destructive ? 'destructive' : 'default'}
              isPending={pending}
              onClick={() => {
                if (!statusTarget) return;
                const target = statusTarget;
                setStatusTarget(null);
                run(
                  () => setManagedUserStatus({ userId: user.userId, status: target, reason: reason || undefined }),
                  'Estado actualizado.'
                );
                setReason('');
              }}
            >
              {statusTarget ? STATUS_ACTIONS[statusTarget].confirm : ''}
            </Button>
          </div>
        </div>
      </ModalShell>

      <ConfirmDialog
        open={confirmRevoke}
        title="Revocar acceso"
        description="Se cerrarán todas las sesiones abiertas del usuario. Deberá volver a iniciar sesión."
        confirmLabel="Cerrar sesiones"
        variant="destructive"
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() =>
          run(async () => {
            const result = await revokeManagedUserSessions(user.userId);
            return result;
          }, 'Sesiones cerradas.')
        }
      />

      <ConfirmDialog
        open={confirmOwner}
        title="Promover a administrador central"
        description="Tendrá acceso total a la clínica, incluida la gestión de usuarios y plan. Solo otro administrador central podrá modificarlo."
        confirmLabel="Promover"
        onClose={() => setConfirmOwner(false)}
        onConfirm={saveGeneral}
      />
    </div>
  );
}
