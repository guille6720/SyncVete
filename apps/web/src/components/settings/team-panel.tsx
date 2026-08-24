'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { inviteTeamMember, revokeInvitation, updateTeamMember } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ROLES,
  ROLE_LABELS,
  formatMeteredUsage,
  isQuotaNearLimit,
  type Branch,
  type OrganizationInvitation,
  type PaginatedResult,
  type SeatUsageMeter,
  type TeamMemberRow,
} from '@sincvete/shared';

interface TeamPanelProps {
  members: PaginatedResult<TeamMemberRow>;
  invitations: OrganizationInvitation[];
  branches: Branch[];
  seatMeters?: SeatUsageMeter[];
  showProfessionalsLink?: boolean;
}

export function TeamPanel({
  members,
  invitations,
  branches,
  seatMeters = [],
  showProfessionalsLink = false,
}: TeamPanelProps) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteTeamMember, null);

  return (
    <div className="space-y-4">
      {seatMeters.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {seatMeters.map((meter, index) => (
            <span key={meter.featureKey}>
              {index > 0 ? ' · ' : ''}
              <span className={isQuotaNearLimit(meter) ? 'text-amber-700 dark:text-amber-300' : undefined}>
                {meter.label}: {formatMeteredUsage(meter)}
              </span>
            </span>
          ))}
        </p>
      ) : null}
      {showProfessionalsLink ? (
        <Card>
          <CardHeader>
            <CardTitle>Profesionales y liquidaciones</CardTitle>
            <CardDescription>
              Registro operativo de compensación (independiente del equipo de usuarios)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/profesionales">Ir a profesionales</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Invitar miembro</CardTitle>
          <CardDescription>Agregá usuarios a tu clínica por email</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={inviteAction} className="grid max-w-xl gap-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" name="email" type="email" required placeholder="vet@clinica.com" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invite-branch">Sucursal</Label>
                <Select id="invite-branch" name="branchId" required defaultValue={branches[0]?.id ?? ''}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Rol</Label>
                <Select id="invite-role" name="role" defaultValue="veterinarian">
                  {ROLES.filter((r) => r !== 'owner').map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {inviteState?.error && <p className="text-sm text-destructive">{inviteState.error}</p>}
            {inviteState?.success && (
              <p className="text-sm text-emerald-600">Invitación procesada correctamente</p>
            )}
            <Button type="submit" disabled={invitePending}>
              {invitePending ? 'Enviando...' : 'Invitar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-muted-foreground">{ROLE_LABELS[inv.role]}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await revokeInvitation(inv.id);
                    window.location.reload();
                  }}
                >
                  Revocar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Equipo ({members.total})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay miembros en el equipo.</p>
          ) : (
            <div className="space-y-3">
              {members.data.map((member) => (
                <MemberRow key={member.memberId} member={member} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemberRow({ member }: { member: TeamMemberRow }) {
  const [state, formAction, pending] = useActionState(updateTeamMember, null);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="memberId" value={member.memberId} />
      <div>
        <p className="font-medium">{member.fullName}</p>
        <p className="text-sm text-muted-foreground">{member.branchName}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Rol</Label>
          <Select name="role" defaultValue={member.role} className="h-9 min-w-[140px]">
            {ROLES.filter((r) => r !== 'owner').map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2 text-sm">
          <input type="hidden" name="isActive" value="false" />
          <input type="checkbox" name="isActive" value="true" defaultChecked={member.isActive} />
          Activo
        </div>
        {!member.isActive && <Badge variant="destructive">Inactivo</Badge>}
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Guardar
        </Button>
      </div>
      {state?.success && <p className="w-full text-sm text-emerald-600">Actualizado</p>}
      {state?.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
