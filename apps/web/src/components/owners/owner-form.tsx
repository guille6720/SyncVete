'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createOwner, updateOwner } from '@/actions/owners';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ARGENTINA_PROVINCES,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type ActionResult,
  type Owner,
} from '@sincvete/shared';

interface OwnerFormProps {
  owner?: Owner;
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
}

export function OwnerForm({ owner, branches, defaultBranchId }: OwnerFormProps) {
  const router = useRouter();
  const action = owner ? updateOwner.bind(null, owner.id) : createOwner;
  const [state, formAction, pending] = useActionState(action, null as ActionResult<{ id: string }> | null);

  useEffect(() => {
    if (!state?.success || !state.data?.id || owner) return;
    router.push(`/tutores/${state.data.id}`);
  }, [state, owner, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{owner ? 'Editar tutor' : 'Nuevo tutor'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-2xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo *</Label>
            <Input
              id="fullName"
              name="fullName"
              required
              defaultValue={owner?.full_name ?? ''}
              placeholder="María González"
            />
            {state?.fieldErrors?.fullName && (
              <p className="text-sm text-destructive">{state.fieldErrors.fullName[0]}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="documentType">Tipo de documento</Label>
              <Select id="documentType" name="documentType" defaultValue={owner?.document_type ?? 'DNI'}>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DOCUMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentNumber">Número de documento</Label>
              <Input
                id="documentNumber"
                name="documentNumber"
                defaultValue={owner?.document_number ?? ''}
                placeholder="12345678"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" defaultValue={owner?.phone ?? ''} placeholder="+54 11 1234-5678" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneWhatsapp">WhatsApp</Label>
              <Input
                id="phoneWhatsapp"
                name="phoneWhatsapp"
                defaultValue={owner?.phone_whatsapp ?? ''}
                placeholder="+54 9 11 1234-5678"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={owner?.email ?? ''} />
            {state?.fieldErrors?.email && (
              <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" name="address" defaultValue={owner?.address ?? ''} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" name="city" defaultValue={owner?.city ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Provincia</Label>
              <Select id="province" name="province" defaultValue={owner?.province ?? ''}>
                <option value="">—</option>
                {ARGENTINA_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Código postal</Label>
              <Input id="postalCode" name="postalCode" defaultValue={owner?.postal_code ?? ''} />
            </div>
          </div>

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal</Label>
              <Select
                id="branchId"
                name="branchId"
                defaultValue={owner?.branch_id ?? defaultBranchId ?? ''}
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

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" defaultValue={owner?.notes ?? ''} rows={3} />
          </div>

          {owner && (
            <div className="flex items-center gap-2 text-sm">
              <input type="hidden" name="isActive" value="false" />
              <input type="checkbox" name="isActive" value="true" defaultChecked={owner.is_active} />
              Tutor activo
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && owner && (
            <p className="text-sm text-emerald-600">Tutor actualizado correctamente</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando...' : owner ? 'Guardar cambios' : 'Crear tutor'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={owner ? `/tutores/${owner.id}` : '/tutores'}>Cancelar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
