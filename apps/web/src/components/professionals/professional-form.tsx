'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createProfessional, updateProfessional } from '@/actions/professionals';
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
  /** Hide user link field when managed in Acceso tab */
  hideUserLink?: boolean;
  compact?: boolean;
}

export function ProfessionalForm({
  mode,
  professional,
  branches,
  staff = [],
  branchIds = [],
  hideUserLink = false,
  compact = false,
}: ProfessionalFormProps) {
  const router = useRouter();
  const action = mode === 'create' ? createProfessional : updateProfessional;
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state?.success) return;
    if (mode === 'create' && state.data?.id) {
      router.push(`/profesionales/${state.data.id}`);
      return;
    }
    router.refresh();
  }, [state, mode, router]);

  useEffect(() => {
    if (mode !== 'create') return;
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#nuevo') return;
    document.getElementById('nuevo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mode]);

  const body = (
    <form action={formAction} className="grid max-w-3xl gap-4">
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
          <Label htmlFor="documentNumber">DNI</Label>
          <Input
            id="documentNumber"
            name="documentNumber"
            defaultValue={professional?.document_number ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxId">CUIT/CUIL</Label>
          <Input id="taxId" name="taxId" defaultValue={professional?.tax_id ?? ''} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="professionalLicense">Matrícula profesional</Label>
          <Input
            id="professionalLicense"
            name="professionalLicense"
            defaultValue={professional?.professional_license ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="professionalLicenseJurisdiction">Jurisdicción matrícula</Label>
          <Input
            id="professionalLicenseJurisdiction"
            name="professionalLicenseJurisdiction"
            defaultValue={professional?.professional_license_jurisdiction ?? ''}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="specialty">Especialidad</Label>
          <Input id="specialty" name="specialty" defaultValue={professional?.specialty ?? ''} />
        </div>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={professional?.phone ?? ''} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={professional?.email ?? ''}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={professional?.date_of_birth ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="avatarUrl">URL de foto/avatar</Label>
          <Input
            id="avatarUrl"
            name="avatarUrl"
            type="url"
            placeholder="https://..."
            defaultValue={professional?.avatar_url ?? ''}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" defaultValue={professional?.address ?? ''} />
      </div>

      {!hideUserLink && (
        <div className="space-y-2">
          <Label htmlFor="userId">Usuario vinculado (opcional)</Label>
          <Select id="userId" name="userId" defaultValue={professional?.user_id ?? ''}>
            <option value="">Sin vincular</option>
            {staff.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </Select>
        </div>
      )}

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
          <Label>Sucursales</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {branches.map((branch) => (
              <label key={branch.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="branchIds"
                  value={branch.id}
                  defaultChecked={branchIds.includes(branch.id)}
                />
                {branch.name}
              </label>
            ))}
          </div>
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
        <Label htmlFor="notes">Observaciones internas</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={professional?.notes ?? ''} />
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && mode === 'edit' && (
        <p className="text-sm text-emerald-600">Profesional actualizado</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando...' : mode === 'create' ? 'Crear profesional' : 'Guardar cambios'}
      </Button>
    </form>
  );

  if (compact) return body;

  return (
    <Card id={mode === 'create' ? 'nuevo' : undefined}>
      <CardHeader>
        <CardTitle>{mode === 'create' ? 'Nuevo profesional' : 'Datos del profesional'}</CardTitle>
        <CardDescription>
          Perfil laboral/operativo. El acceso a la plataforma se gestiona en la pestaña Acceso.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
