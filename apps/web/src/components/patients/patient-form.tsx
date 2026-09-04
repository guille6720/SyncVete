'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { createPatient, updatePatient } from '@/actions/patients';
import { OwnerPicker } from '@/components/patients/owner-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  PATIENT_SPECIES,
  PATIENT_SEX,
  SPECIES_EMOJI,
  type ActionResult,
  type Patient,
} from '@sincvete/shared';

interface PatientFormProps {
  patient?: Patient;
  ownerName?: string;
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  defaultOwnerId?: string;
  returnTo?: string | null;
}

export function PatientForm({
  patient,
  ownerName,
  branches,
  defaultBranchId,
  defaultOwnerId,
  returnTo = null,
}: PatientFormProps) {
  const router = useRouter();
  const action = patient ? updatePatient.bind(null, patient.id) : createPatient;
  const [state, formAction, pending] = useActionState(action, null as ActionResult<{ id: string }> | null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(patient?.photo_url ?? null);

  useEffect(() => {
    if (!state?.success || !state.data?.id) return;
    if (!patient) {
      router.push(returnTo || `/pacientes/${state.data.id}`);
    }
  }, [state, patient, router, returnTo]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onPhotoChange = (file: File | null) => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setPreviewUrl(patient?.photo_url ?? null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{patient ? 'Editar paciente' : 'Nuevo paciente'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-2xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="photo">Foto</Label>
            <div className="flex items-center gap-4">
              <label
                htmlFor="photo"
                className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/40 bg-muted/40 transition hover:border-primary hover:bg-muted"
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Foto del paciente" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-7 w-7 text-muted-foreground" />
                )}
                <input
                  id="photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="text-sm text-muted-foreground">
                <p>Subí una foto del paciente (opcional).</p>
                <p>JPG, PNG, WebP o GIF · máx. 5 MB</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={patient?.name ?? ''}
              placeholder="Firulais"
            />
            {state?.fieldErrors?.name && (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            )}
          </div>

          <OwnerPicker
            defaultOwnerId={patient?.owner_id ?? defaultOwnerId}
            defaultOwnerName={ownerName}
            error={state?.fieldErrors?.ownerId?.[0]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="species">Especie</Label>
              <Select id="species" name="species" defaultValue={patient?.species ?? 'Canino'}>
                {PATIENT_SPECIES.map((species) => (
                  <option key={species} value={species}>
                    {SPECIES_EMOJI[species]} {species}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sex">Sexo</Label>
              <Select id="sex" name="sex" defaultValue={patient?.sex ?? 'Desconocido'}>
                {PATIENT_SEX.map((sex) => (
                  <option key={sex} value={sex}>
                    {sex}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="breed">Raza</Label>
              <Input id="breed" name="breed" defaultValue={patient?.breed ?? ''} placeholder="Mestizo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input id="color" name="color" defaultValue={patient?.color ?? ''} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="birthDate">Fecha de nacimiento</Label>
              <Input
                id="birthDate"
                name="birthDate"
                type="date"
                defaultValue={patient?.birth_date ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="microchip">Microchip</Label>
              <Input id="microchip" name="microchip" defaultValue={patient?.microchip ?? ''} />
            </div>
          </div>

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal</Label>
              <Select
                id="branchId"
                name="branchId"
                defaultValue={patient?.branch_id ?? defaultBranchId ?? ''}
              >
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="hidden" name="isNeutered" value="false" />
              <input
                type="checkbox"
                name="isNeutered"
                value="true"
                defaultChecked={patient?.is_neutered ?? false}
              />
              Castrado / esterilizado
            </label>
            <label className="flex items-center gap-2">
              <input type="hidden" name="isDeceased" value="false" />
              <input
                type="checkbox"
                name="isDeceased"
                value="true"
                defaultChecked={patient?.is_deceased ?? false}
              />
              Fallecido
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deceasedAt">Fecha de fallecimiento</Label>
            <Input
              id="deceasedAt"
              name="deceasedAt"
              type="date"
              defaultValue={patient?.deceased_at ?? ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" defaultValue={patient?.notes ?? ''} rows={3} />
          </div>

          {patient && (
            <div className="flex items-center gap-2 text-sm">
              <input type="hidden" name="isActive" value="false" />
              <input type="checkbox" name="isActive" value="true" defaultChecked={patient.is_active} />
              Paciente activo
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && patient && (
            <p className="text-sm text-emerald-600">Paciente actualizado correctamente</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" isPending={pending}>
              {pending ? 'Guardando...' : patient ? 'Guardar cambios' : 'Crear paciente'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={patient ? `/pacientes/${patient.id}` : '/pacientes'}>Cancelar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
