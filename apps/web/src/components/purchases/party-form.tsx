'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createPurchaseParty, updatePurchaseParty } from '@/actions/purchase-catalog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CatalogDelete } from '@/components/purchases/catalog-management';
import {
  PURCHASE_PARTY_KIND_LABELS,
  PURCHASE_PARTY_SCOPE_LABELS,
  type PurchaseParty,
  type PurchasePartyKind,
  type PurchasePartyScope,
} from '@sincvete/shared';

interface PartyFormProps {
  kind: PurchasePartyKind;
  scope: PurchasePartyScope;
  party?: PurchaseParty;
  listHref: string;
}

export function PartyForm({ kind, scope, party, listHref }: PartyFormProps) {
  const action = party ? updatePurchaseParty.bind(null, party.id) : createPurchaseParty;
  const [state, formAction, pending] = useActionState(action, null);
  const title = scope === 'vacunas' ? 'Proveedor de vacunas' : PURCHASE_PARTY_KIND_LABELS[kind];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {party ? `Editar ${title.toLowerCase()}` : `Nuevo ${title.toLowerCase()}`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {PURCHASE_PARTY_KIND_LABELS[kind]}
          {scope === 'vacunas' ? ` · ${PURCHASE_PARTY_SCOPE_LABELS[scope]}` : ''}
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-2xl gap-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="scope" value={scope} />

          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" name="name" required defaultValue={party?.name ?? ''} />
            {state?.fieldErrors?.name?.[0] && (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cuit">CUIT</Label>
              <Input
                id="cuit"
                name="cuit"
                inputMode="numeric"
                maxLength={13}
                placeholder="30-12345678-9"
                defaultValue={party?.cuit ?? ''}
              />
              {state?.fieldErrors?.cuit?.[0] && (
                <p className="text-sm text-destructive">{state.fieldErrors.cuit[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Contacto</Label>
              <Input id="contactName" name="contactName" defaultValue={party?.contact_name ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" defaultValue={party?.phone ?? ''} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={party?.email ?? ''} />
            {state?.fieldErrors?.email?.[0] && (
              <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={party?.notes ?? ''} />
          </div>

          {party ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={party.is_active} />
              Activo
            </label>
          ) : null}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && <p className="text-sm text-muted-foreground">Cambios guardados.</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando...' : party ? 'Guardar' : 'Agregar'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={listHref}>Cancelar</Link>
            </Button>
          </div>
        </form>
        {party && (
          <div className="mt-4">
            <CatalogDelete id={party.id} kind="party" returnHref={listHref} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
