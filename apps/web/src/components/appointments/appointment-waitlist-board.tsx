'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import {
  createWaitlistEntry,
  deleteWaitlistEntry,
  updateWaitlistStatus,
} from '@/actions/appointment-waitlist';
import { PatientPicker } from '@/components/appointments/patient-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABELS,
  WAITLIST_STATUS_LABELS,
  type AppointmentType,
  type AssignableStaffMember,
  type WaitlistEntry,
} from '@sincvete/shared';

export type WaitlistEntryView = WaitlistEntry & {
  patient_name?: string | null;
  owner_full_name?: string | null;
};

interface AppointmentWaitlistBoardProps {
  entries: WaitlistEntryView[];
  staff: AssignableStaffMember[];
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  canWrite: boolean;
}

export function AppointmentWaitlistBoard({
  entries,
  staff,
  branches,
  defaultBranchId,
  canWrite,
}: AppointmentWaitlistBoardProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  const handleCreate = (formData: FormData) => {
    const patientId = String(formData.get('patientId') ?? '');
    const ownerId = String(formData.get('ownerId') ?? '');
    const branchId = String(formData.get('branchId') ?? defaultBranchId ?? '');
    if (!patientId || !ownerId || !branchId) {
      setError('Seleccioná paciente y sucursal');
      return;
    }

    void runPending(async () => {
      setError(null);
      const result = await createWaitlistEntry({
        branchId,
        ownerId,
        patientId,
        appointmentType: String(formData.get('appointmentType') || 'consulta'),
        preferredUserId: String(formData.get('preferredUserId') || '') || undefined,
        priority: Number(formData.get('priority') || 0),
        notes: String(formData.get('notes') || '') || undefined,
        preferredTimeStart: String(formData.get('preferredTimeStart') || '') || undefined,
        preferredTimeEnd: String(formData.get('preferredTimeEnd') || '') || undefined,
      });
      if (!result.success) {
        setError(result.error ?? 'No se pudo agregar a la lista');
        return;
      }
      setCreateOpen(false);
      router.refresh();
    });
  };

  const markBooked = (id: string) => {
    void runPending(async () => {
      const result = await updateWaitlistStatus({ id, status: 'booked' });
      if (!result.success) {
        setAlert(result.error ?? 'No se pudo actualizar');
        return;
      }
      router.refresh();
    });
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    void runPending(async () => {
      const result = await deleteWaitlistEntry(deleteId);
      if (!result.success) {
        setAlert(result.error ?? 'No se pudo eliminar');
        return;
      }
      setDeleteId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Eliminar de la lista"
        description="¿Quitar esta entrada de la lista de espera?"
        confirmLabel="Eliminar"
        variant="destructive"
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={Boolean(alert)}
        mode="alert"
        title="No se pudo completar"
        description={alert ?? ''}
        onClose={() => setAlert(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entries.length} entrada{entries.length !== 1 ? 's' : ''} abierta
          {entries.length !== 1 ? 's' : ''}
        </p>
        {canWrite && (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay pacientes en lista de espera.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {entry.patient_name ?? `Paciente ${entry.patient_id.slice(0, 8)}`}
                    </p>
                    <Badge>{WAITLIST_STATUS_LABELS[entry.status]}</Badge>
                    <Badge variant="warning">Prioridad {entry.priority}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {entry.owner_full_name ?? `Tutor ${entry.owner_id.slice(0, 8)}`}
                    {' · '}
                    {APPOINTMENT_TYPE_LABELS[entry.appointment_type as AppointmentType] ??
                      entry.appointment_type}
                  </p>
                  {(entry.preferred_time_start || entry.preferred_time_end) && (
                    <p className="text-xs text-muted-foreground">
                      Horario preferido:{' '}
                      {[entry.preferred_time_start, entry.preferred_time_end]
                        .filter(Boolean)
                        .join(' – ')}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="text-sm text-muted-foreground">{entry.notes}</p>
                  )}
                </div>
                {canWrite && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      isPending={pending}
                      onClick={() => markBooked(entry.id)}
                    >
                      Marcar reservada
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      isPending={pending}
                      onClick={() => setDeleteId(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Quitar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ModalShell
        open={createOpen}
        titleId="waitlist-create-title"
        title="Agregar a lista de espera"
        description="Registrá preferencias mientras no haya hueco."
        onClose={() => setCreateOpen(false)}
        maxWidthClassName="max-w-lg"
      >
        <form action={handleCreate} className="mt-4 space-y-4">
          <PatientPicker defaultBranchId={defaultBranchId} />
          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="waitlist-branch">Sucursal *</Label>
              <Select
                id="waitlist-branch"
                name="branchId"
                required
                defaultValue={defaultBranchId ?? ''}
              >
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="waitlist-type">Tipo</Label>
              <Select id="waitlist-type" name="appointmentType" defaultValue="consulta">
                {APPOINTMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {APPOINTMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-priority">Prioridad</Label>
              <Input id="waitlist-priority" name="priority" type="number" defaultValue={0} min={0} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="waitlist-staff">Profesional preferido</Label>
            <Select id="waitlist-staff" name="preferredUserId" defaultValue="">
              <option value="">Indistinto</option>
              {staff.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="waitlist-time-start">Desde</Label>
              <Input id="waitlist-time-start" name="preferredTimeStart" type="time" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-time-end">Hasta</Label>
              <Input id="waitlist-time-end" name="preferredTimeEnd" type="time" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="waitlist-notes">Notas</Label>
            <Textarea id="waitlist-notes" name="notes" rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
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
