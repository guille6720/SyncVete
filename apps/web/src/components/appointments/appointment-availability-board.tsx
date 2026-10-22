'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import {
  deleteProfessionalSchedule,
  deleteProfessionalTimeBlock,
  upsertProfessionalSchedule,
  upsertProfessionalTimeBlock,
} from '@/actions/appointment-availability';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  TIME_BLOCK_KINDS,
  TIME_BLOCK_KIND_LABELS,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
  type AssignableStaffMember,
  type ProfessionalSchedule,
  type ProfessionalTimeBlock,
  type TimeBlockKind,
} from '@sincvete/shared';

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

interface AppointmentAvailabilityBoardProps {
  schedules: ProfessionalSchedule[];
  blocks: ProfessionalTimeBlock[];
  staff: AssignableStaffMember[];
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  canWrite: boolean;
}

function formatTime(value: string): string {
  return value.slice(0, 5);
}

export function AppointmentAvailabilityBoard({
  schedules,
  blocks,
  staff,
  branches,
  defaultBranchId,
  canWrite,
}: AppointmentAvailabilityBoardProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  const staffName = (userId: string | null) => {
    if (!userId) return 'Toda la sucursal';
    return staff.find((member) => member.userId === userId)?.fullName ?? userId.slice(0, 8);
  };

  const handleSchedule = (formData: FormData) => {
    const branchId = String(formData.get('branchId') ?? defaultBranchId ?? '');
    const userId = String(formData.get('userId') ?? '');
    if (!branchId || !userId) {
      setError('Seleccioná sucursal y profesional');
      return;
    }
    void runPending(async () => {
      setError(null);
      const result = await upsertProfessionalSchedule({
        branchId,
        userId,
        weekday: Number(formData.get('weekday')),
        startTime: String(formData.get('startTime')),
        endTime: String(formData.get('endTime')),
        slotDurationMinutes: Number(formData.get('slotDurationMinutes') || 30),
        isActive: true,
      });
      if (!result.success) {
        setError(result.error ?? 'No se pudo guardar el horario');
        return;
      }
      setScheduleOpen(false);
      router.refresh();
    });
  };

  const handleBlock = (formData: FormData) => {
    const branchId = String(formData.get('branchId') ?? defaultBranchId ?? '');
    const startsAtRaw = String(formData.get('startsAt') ?? '');
    const endsAtRaw = String(formData.get('endsAt') ?? '');
    if (!branchId || !startsAtRaw || !endsAtRaw) {
      setError('Completá sucursal e intervalo');
      return;
    }
    void runPending(async () => {
      setError(null);
      const result = await upsertProfessionalTimeBlock({
        branchId,
        startsAt: fromLocalDateTimeInput(startsAtRaw),
        endsAt: fromLocalDateTimeInput(endsAtRaw),
        kind: String(formData.get('kind') || 'blocked'),
        userId: String(formData.get('userId') || '') || undefined,
        reason: String(formData.get('reason') || '') || undefined,
      });
      if (!result.success) {
        setError(result.error ?? 'No se pudo crear el bloqueo');
        return;
      }
      setBlockOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={Boolean(deleteScheduleId)}
        title="Eliminar horario"
        description="¿Eliminar este horario semanal?"
        confirmLabel="Eliminar"
        variant="destructive"
        onClose={() => setDeleteScheduleId(null)}
        onConfirm={() => {
          if (!deleteScheduleId) return;
          void runPending(async () => {
            const result = await deleteProfessionalSchedule(deleteScheduleId);
            if (!result.success) {
              setAlert(result.error ?? 'No se pudo eliminar');
              return;
            }
            setDeleteScheduleId(null);
            router.refresh();
          });
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteBlockId)}
        title="Eliminar bloqueo"
        description="¿Eliminar este bloqueo de agenda?"
        confirmLabel="Eliminar"
        variant="destructive"
        onClose={() => setDeleteBlockId(null)}
        onConfirm={() => {
          if (!deleteBlockId) return;
          void runPending(async () => {
            const result = await deleteProfessionalTimeBlock(deleteBlockId);
            if (!result.success) {
              setAlert(result.error ?? 'No se pudo eliminar');
              return;
            }
            setDeleteBlockId(null);
            router.refresh();
          });
        }}
      />
      <ConfirmDialog
        open={Boolean(alert)}
        mode="alert"
        title="No se pudo completar"
        description={alert ?? ''}
        onClose={() => setAlert(null)}
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Horarios semanales</CardTitle>
          {canWrite && (
            <Button type="button" size="sm" onClick={() => { setError(null); setScheduleOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar horario
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin horarios configurados.</p>
          ) : (
            schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{staffName(schedule.user_id)}</p>
                  <p className="text-sm text-muted-foreground">
                    {WEEKDAY_LABELS[schedule.weekday] ?? `Día ${schedule.weekday}`} ·{' '}
                    {formatTime(schedule.start_time)} – {formatTime(schedule.end_time)} · slots{' '}
                    {schedule.slot_duration_minutes} min
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={schedule.is_active ? 'success' : 'default'}>
                    {schedule.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  {canWrite && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteScheduleId(schedule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Bloqueos</CardTitle>
          {canWrite && (
            <Button type="button" size="sm" onClick={() => { setError(null); setBlockOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar bloqueo
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin bloqueos en el rango.</p>
          ) : (
            blocks.map((block) => (
              <div
                key={block.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{staffName(block.user_id)}</p>
                  <p className="text-sm text-muted-foreground">
                    {TIME_BLOCK_KIND_LABELS[block.kind as TimeBlockKind] ?? block.kind} ·{' '}
                    {toLocalDateTimeInput(block.starts_at).replace('T', ' ')} →{' '}
                    {toLocalDateTimeInput(block.ends_at).replace('T', ' ')}
                  </p>
                  {block.reason && (
                    <p className="text-xs text-muted-foreground">{block.reason}</p>
                  )}
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteBlockId(block.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ModalShell
        open={scheduleOpen}
        titleId="schedule-create-title"
        title="Nuevo horario semanal"
        onClose={() => setScheduleOpen(false)}
        maxWidthClassName="max-w-lg"
      >
        <form action={handleSchedule} className="mt-4 space-y-4">
          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="sched-branch">Sucursal *</Label>
              <Select id="sched-branch" name="branchId" required defaultValue={defaultBranchId ?? ''}>
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sched-user">Profesional *</Label>
            <Select id="sched-user" name="userId" required defaultValue="">
              <option value="">—</option>
              {staff.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sched-weekday">Día</Label>
              <Select id="sched-weekday" name="weekday" defaultValue="1">
                {Object.entries(WEEKDAY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-start">Desde</Label>
              <Input id="sched-start" name="startTime" type="time" required defaultValue="09:00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-end">Hasta</Label>
              <Input id="sched-end" name="endTime" type="time" required defaultValue="18:00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-slot">Duración de slot (min)</Label>
            <Input
              id="sched-slot"
              name="slotDurationMinutes"
              type="number"
              min={5}
              max={480}
              defaultValue={30}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isPending={pending}>
              Guardar
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={blockOpen}
        titleId="block-create-title"
        title="Nuevo bloqueo"
        onClose={() => setBlockOpen(false)}
        maxWidthClassName="max-w-lg"
      >
        <form action={handleBlock} className="mt-4 space-y-4">
          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="block-branch">Sucursal *</Label>
              <Select id="block-branch" name="branchId" required defaultValue={defaultBranchId ?? ''}>
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="block-user">Profesional</Label>
            <Select id="block-user" name="userId" defaultValue="">
              <option value="">Toda la sucursal</option>
              {staff.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-kind">Tipo</Label>
            <Select id="block-kind" name="kind" defaultValue="blocked">
              {TIME_BLOCK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {TIME_BLOCK_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="block-start">Desde</Label>
              <Input id="block-start" name="startsAt" type="datetime-local" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-end">Hasta</Label>
              <Input id="block-end" name="endsAt" type="datetime-local" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Motivo</Label>
            <Input id="block-reason" name="reason" placeholder="Vacaciones, reunión..." />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBlockOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isPending={pending}>
              Guardar
            </Button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
