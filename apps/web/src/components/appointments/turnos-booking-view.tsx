'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import {
  getProfessionalAgendaContext,
  type ProfessionalAgendaContext,
} from '@/actions/appointment-availability';
import { ProfessionalSchedulePanel } from '@/components/appointments/professional-schedule-panel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  filterAssignableStaffByBranch,
  formatDateParam,
  type AssignableStaffMember,
} from '@sincvete/shared';

interface TurnosBookingViewProps {
  staff: AssignableStaffMember[];
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  canWrite: boolean;
  initialAssignedUserId?: string;
}

export function TurnosBookingView({
  staff,
  branches,
  defaultBranchId = null,
  canWrite,
  initialAssignedUserId = '',
}: TurnosBookingViewProps) {
  const [branchId, setBranchId] = useState(defaultBranchId ?? '');
  const [assignedUserId, setAssignedUserId] = useState(initialAssignedUserId);
  const [context, setContext] = useState<ProfessionalAgendaContext | null>(null);
  const [pending, setPending] = useState(false);
  const today = formatDateParam(new Date());

  const visibleStaff = useMemo(
    () => filterAssignableStaffByBranch(staff, branchId || null),
    [staff, branchId]
  );

  useEffect(() => {
    if (assignedUserId && !visibleStaff.some((member) => member.userId === assignedUserId)) {
      setAssignedUserId('');
    }
  }, [visibleStaff, assignedUserId]);

  useEffect(() => {
    if (!assignedUserId) {
      setContext(null);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    void getProfessionalAgendaContext({
      userId: assignedUserId,
      branchId: branchId || null,
    })
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedUserId, branchId]);

  const nuevoTurnoHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('date', today);
    if (assignedUserId) params.set('assigned', assignedUserId);
    if (branchId) params.set('branch', branchId);
    return `/agenda/nueva?${params.toString()}`;
  }, [today, assignedUserId, branchId]);

  const selectedStaff = visibleStaff.find((member) => member.userId === assignedUserId) ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {branches.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="turnos-branch">Sucursal</Label>
            <Select
              id="turnos-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              aria-label="Sucursal"
            >
              <option value="">Todas / sin filtrar</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="turnos-professional">Profesional</Label>
          <Select
            id="turnos-professional"
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            aria-label="Elegir profesional"
          >
            <option value="">Elegí un profesional…</option>
            {visibleStaff.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
                {member.specialty ? ` · ${member.specialty}` : ''}
              </option>
            ))}
          </Select>
          {visibleStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay profesionales disponibles en esta sucursal.
            </p>
          ) : null}
        </div>
      </div>

      {!assignedUserId ? (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Seleccioná un profesional para ver sus días y horarios de atención.
        </div>
      ) : pending && !context ? (
        <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
          Cargando agenda de {selectedStaff?.fullName ?? 'profesional'}…
        </div>
      ) : (
        <div className="space-y-4">
          <ProfessionalSchedulePanel
            fullName={context?.fullName ?? selectedStaff?.fullName ?? 'Profesional'}
            specialty={context?.specialty ?? selectedStaff?.specialty}
            schedules={context?.schedules ?? []}
            selectedDate={today}
          />

          {canWrite ? (
            <Button asChild className="w-full sm:w-auto" disabled={!assignedUserId}>
              <Link href={nuevoTurnoHref}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo turno
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tenés permiso para crear turnos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
