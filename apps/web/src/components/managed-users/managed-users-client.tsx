'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  INVITABLE_ROLES,
  getPermissionsForRole,
  type ManagedInvitationRow,
  type ManagedUserRow,
  type ManagedUsersOverview,
  type Permission,
  type Role,
} from '@sincvete/shared';
import {
  inviteManagedUser,
  resendManagedInvitation,
  revokeManagedInvitation,
} from '@/actions/managed-users';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { PermissionMatrix } from '@/components/managed-users/permission-matrix';
import {
  UserStatusBadge,
  formatDateTime,
  managedRoleLabel,
} from '@/components/managed-users/shared';

interface ManagedUsersClientProps {
  overview: ManagedUsersOverview;
  users: ManagedUserRow[];
  invitations: ManagedInvitationRow[];
  branches: Array<{ id: string; name: string }>;
  actorPermissions: Permission[];
  canViewActivity: boolean;
}

export function ManagedUsersClient({
  overview,
  users,
  invitations,
  branches,
  actorPermissions,
  canViewActivity,
}: ManagedUsersClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ManagedInvitationRow | null>(null);
  const [, startTransition] = useTransition();

  const limitReached = overview.seatsUsed >= overview.limit;
  const available = Math.max(0, overview.limit - overview.seatsUsed);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(term) ||
        (u.email ?? '').toLowerCase().includes(term) ||
        (u.branchName ?? '').toLowerCase().includes(term)
    );
  }, [users, search]);

  const resend = (invitation: ManagedInvitationRow) => {
    setPendingInvite(invitation.id);
    startTransition(async () => {
      const result = await resendManagedInvitation(invitation.id);
      setPendingInvite(null);
      if (!result.success) {
        setNotice({ kind: 'error', text: result.error ?? 'No se pudo reenviar' });
        return;
      }
      setNotice({
        kind: 'ok',
        text: result.data?.emailSent
          ? `Invitación reenviada a ${invitation.email}.`
          : 'Invitación renovada, pero no se pudo enviar el email. Reintentá en unos minutos.',
      });
      router.refresh();
    });
  };

  const revoke = (invitation: ManagedInvitationRow) => {
    setPendingInvite(invitation.id);
    startTransition(async () => {
      const result = await revokeManagedInvitation(invitation.id);
      setPendingInvite(null);
      setNotice(
        result.success
          ? { kind: 'ok', text: 'Invitación revocada.' }
          : { kind: 'error', text: result.error ?? 'No se pudo revocar' }
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios y permisos</h1>
          <p className="text-muted-foreground">
            Gestioná quién accede a tu clínica, con qué rol y qué puede hacer en cada módulo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewActivity ? (
            <Button variant="outline" asChild>
              <Link href="/configuracion/usuarios/actividad">Ver actividad</Link>
            </Button>
          ) : null}
          <Button onClick={() => setAddOpen(true)} disabled={limitReached}>
            + Agregar usuario
          </Button>
        </div>
      </div>

      {limitReached ? (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Alcanzaste el límite de {overview.limit} usuarios para tu organización.
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            notice.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <OverviewCard
          label="Usuarios activos"
          value={`${overview.activeManaged} / ${overview.limit}`}
          hint={`${overview.seatsUsed} cupos en uso`}
        />
        <OverviewCard label="Total de usuarios" value={String(overview.totalUsers)} />
        <OverviewCard label="Invitaciones pendientes" value={String(overview.pendingInvitations)} />
        <OverviewCard label="Suspendidos" value={String(overview.suspended)} />
        <OverviewCard label="Cupos disponibles" value={String(available)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Usuarios ({users.length})</CardTitle>
          <Input
            type="search"
            placeholder="Buscar por nombre, email o sucursal"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
            aria-label="Buscar usuarios"
          />
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay usuarios que coincidan.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-medium">Usuario</th>
                      <th className="py-2 pr-3 font-medium">Rol</th>
                      <th className="py-2 pr-3 font-medium">Sucursal</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 pr-3 font-medium">Último acceso</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((user) => (
                      <tr key={user.userId} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{user.fullName}</p>
                          <p className="text-xs text-muted-foreground">{user.email ?? '—'}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {managedRoleLabel(user.role)}
                          {user.deniedPermissions.length > 0 ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({user.deniedPermissions.length} restringidos)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          {user.branchName ?? '—'}
                          {user.branchCount > 1 ? (
                            <span className="text-xs text-muted-foreground"> +{user.branchCount - 1}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          <UserStatusBadge status={user.status} />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {formatDateTime(user.lastSignInAt)}
                        </td>
                        <td className="py-2 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/configuracion/usuarios/${user.userId}`}>Gestionar</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 md:hidden">
                {filtered.map((user) => (
                  <li key={user.userId} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email ?? '—'}</p>
                      </div>
                      <UserStatusBadge status={user.status} />
                    </div>
                    <p className="mt-1 text-sm">
                      {managedRoleLabel(user.role)} · {user.branchName ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Último acceso: {formatDateTime(user.lastSignInAt)}
                    </p>
                    <Button size="sm" variant="outline" className="mt-2 w-full" asChild>
                      <Link href={`/configuracion/usuarios/${user.userId}`}>Gestionar</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invitaciones ({invitations.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {invitation.fullName ?? invitation.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invitation.email} · {managedRoleLabel(invitation.role)} ·{' '}
                    {invitation.branchName ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.status === 'expired' ? 'Venció' : 'Vence'}{' '}
                    {formatDateTime(invitation.expiresAt)} · enviada {invitation.sendCount}{' '}
                    {invitation.sendCount === 1 ? 'vez' : 'veces'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <UserStatusBadge status="invited" />
                  {invitation.status === 'expired' ? (
                    <span className="text-xs text-amber-700">Vencida</span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    isPending={pendingInvite === invitation.id}
                    onClick={() => resend(invitation)}
                  >
                    Reenviar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingInvite === invitation.id}
                    onClick={() => setRevokeTarget(invitation)}
                  >
                    Revocar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <AddUserDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        branches={branches}
        actorPermissions={actorPermissions}
        onDone={(text) => {
          setAddOpen(false);
          setNotice({ kind: 'ok', text });
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revocar invitación"
        description={`El enlace enviado a ${revokeTarget?.email ?? ''} dejará de funcionar.`}
        confirmLabel="Revocar"
        variant="destructive"
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) revoke(revokeTarget);
        }}
      />
    </div>
  );
}

function OverviewCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function AddUserDialog({
  open,
  onClose,
  branches,
  actorPermissions,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  branches: Array<{ id: string; name: string }>;
  actorPermissions: Permission[];
  onDone: (message: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const defaultDenied = (forRole: Role) => {
    const held = new Set(actorPermissions);
    return getPermissionsForRole(forRole).filter((p) => !held.has(p));
  };
  const [role, setRole] = useState<Role>('veterinarian');
  const [denied, setDenied] = useState<string[]>(() => defaultDenied('veterinarian'));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setRole('veterinarian');
    setDenied(defaultDenied('veterinarian'));
    setError(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteManagedUser({
        email,
        fullName,
        phone,
        branchId,
        role,
        deniedPermissions: denied as Permission[],
      });
      if (!result.success) {
        setError(result.error ?? 'No se pudo invitar al usuario');
        return;
      }
      const sentTo = email;
      reset();
      onDone(
        result.data?.emailSent
          ? `Invitación enviada a ${sentTo}. Va a recibir un email para crear su contraseña.`
          : `Invitación creada para ${sentTo}, pero no se pudo enviar el email. Usá "Reenviar".`
      );
    });
  };

  return (
    <ModalShell
      open={open}
      titleId="add-managed-user-title"
      title="Agregar usuario"
      description="El usuario recibirá un email para crear su contraseña e ingresar."
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
    >
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mu-name">Nombre completo</Label>
            <Input
              id="mu-name"
              required
              minLength={2}
              maxLength={200}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mu-email">Email</Label>
            <Input
              id="mu-email"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mu-phone">Teléfono (opcional)</Label>
            <Input
              id="mu-phone"
              type="tel"
              maxLength={40}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mu-branch">Sucursal</Label>
            <Select
              id="mu-branch"
              required
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="mu-role">Rol</Label>
            <Select
              id="mu-role"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as Role;
                setRole(nextRole);
                setDenied(defaultDenied(nextRole));
              }}
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {managedRoleLabel(r)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Permisos por módulo</p>
          <PermissionMatrix
            role={role}
            denied={denied}
            onChange={setDenied}
            actorPermissions={actorPermissions}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isPending={pending}>
            Enviar invitación
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
