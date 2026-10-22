'use client';

import { useActionState, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createProfessional, updateProfessional } from '@/actions/professionals';
import {
  DEFAULT_WEEKDAY_HOURS,
  ProfessionalHoursEditor,
  type ProfessionalHoursDraft,
} from '@/components/professionals/professional-hours-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  PROFESSIONAL_RELATIONSHIP_TYPES,
  PROFESSIONAL_RELATIONSHIP_LABELS,
  type Professional,
} from '@sincvete/shared';

interface StaffOption {
  userId: string;
  fullName: string;
}

interface BranchOption {
  id: string;
  name: string;
}

interface ProfessionalFormProps {
  mode: 'create' | 'edit';
  professional?: Professional;
  branches: BranchOption[];
  staff?: StaffOption[];
  branchIds?: string[];
  initialHours?: ProfessionalHoursDraft[];
}

export function ProfessionalForm({
  mode,
  professional,
  branches,
  staff = [],
  branchIds = [],
  initialHours,
}: ProfessionalFormProps) {
  const router = useRouter();
  const action = mode === 'create' ? createProfessional : updateProfessional;
  const [state, formAction, pending] = useActionState(action, null);
  const [enableAgenda, setEnableAgenda] = useState(
    mode === 'create' || !professional?.user_id
  );
  const [linkedUserId, setLinkedUserId] = useState(professional?.user_id ?? '');
  const [hours, setHours] = useState<ProfessionalHoursDraft[]>(
    initialHours && initialHours.length > 0
      ? initialHours
      : mode === 'create'
        ? DEFAULT_WEEKDAY_HOURS
        : []
  );

  useEffect(() => {
    if (!state?.success) return;
    if (mode === 'create' && state.data?.id) {
      router.push(`/profesionales/${state.data.id}`);
      return;
    }
    router.refresh();
  }, [state, mode, router]);

  const needsAgendaEmail = enableAgenda && !linkedUserId;
  const alreadyOnAgenda = Boolean(professional?.user_id);
  const showHours = enableAgenda || alreadyOnAgenda;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'create' ? 'Nuevo profesional' : 'Editar profesional'}</CardTitle>
        <CardDescription>
          Completá los datos, habilitá agenda y definí días y horarios de atención.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-2xl gap-4">
          {professional && <input type="hidden" name="id" value={professional.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input
                id="firstName"
                name="firstName"
                required
                defaultValue={professional?.first_name ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellido</Label>
              <Input
                id="lastName"
                name="lastName"
                required
                defaultValue={professional?.last_name ?? ''}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="relationshipType">Relación con la clínica</Label>
              <Select
                id="relationshipType"
                name="relationshipType"
                defaultValue={professional?.relationship_type ?? 'independent'}
              >
                {PROFESSIONAL_RELATIONSHIP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROFESSIONAL_RELATIONSHIP_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="userId">Usuario vinculado (opcional)</Label>
              <Select
                id="userId"
                name="userId"
                value={linkedUserId}
                onChange={(e) => setLinkedUserId(e.target.value)}
              >
                <option value="">Sin vincular</option>
                {staff.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="enableAgenda"
                value="true"
                className="mt-0.5"
                checked={enableAgenda}
                onChange={(e) => setEnableAgenda(e.target.checked)}
              />
              <span>
                <span className="font-medium">Disponible en agenda / Nuevo turno</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {alreadyOnAgenda && !enableAgenda
                    ? 'Este profesional ya está vinculado a un usuario de agenda.'
                    : 'Lo agrega automáticamente a las opciones al crear un turno.'}
                </span>
              </span>
            </label>
            {needsAgendaEmail && (
              <div className="space-y-2">
                <Label htmlFor="agendaEmail">Email para agenda *</Label>
                <Input
                  id="agendaEmail"
                  name="agendaEmail"
                  type="email"
                  required={needsAgendaEmail}
                  placeholder="profesional@clinica.com"
                />
                <p className="text-xs text-muted-foreground">
                  Se crea o reutiliza el usuario del equipo con rol veterinario en las sucursales
                  seleccionadas.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="specialty">Especialidad</Label>
              <Input id="specialty" name="specialty" defaultValue={professional?.specialty ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">CUIT/CUIL</Label>
              <Input id="taxId" name="taxId" defaultValue={professional?.tax_id ?? ''} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Inicio</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={professional?.start_date ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Fin</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={professional?.end_date ?? ''}
              />
            </div>
          </div>

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label>Sucursales {enableAgenda ? '*' : ''}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {branches.map((branch) => (
                  <label key={branch.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="branchIds"
                      value={branch.id}
                      defaultChecked={
                        branchIds.includes(branch.id) ||
                        (mode === 'create' && branches.length === 1)
                      }
                    />
                    {branch.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {showHours && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Días y horarios de atención</p>
                <p className="text-xs text-muted-foreground">
                  Se guardan en la agenda del profesional para tomar turnos.
                </p>
              </div>
              <ProfessionalHoursEditor value={hours} onChange={setHours} disabled={pending} />
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isActive"
                value="true"
                defaultChecked={professional?.is_active ?? true}
              />
              Activo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="invoiceRequired"
                value="true"
                defaultChecked={professional?.invoice_required ?? false}
              />
              Requiere factura (independiente)
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={professional?.notes ?? ''} />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.fieldErrors?.agendaEmail?.[0] && (
            <p className="text-sm text-destructive">{state.fieldErrors.agendaEmail[0]}</p>
          )}
          {state?.success && mode === 'edit' && (
            <p className="text-sm text-emerald-600">Profesional actualizado</p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? 'Guardando...' : mode === 'create' ? 'Crear profesional' : 'Guardar cambios'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
