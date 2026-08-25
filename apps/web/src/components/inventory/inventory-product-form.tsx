'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { createInventoryProduct } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  INVENTORY_PRODUCT_CATEGORIES,
  INVENTORY_PRODUCT_CATEGORY_LABELS,
  INVENTORY_PRODUCT_PRESETS,
  INVENTORY_UNITS,
  INVENTORY_UNIT_LABELS,
} from '@sincvete/shared';

interface InventoryProductFormProps {
  branches: Array<{ id: string; name: string }>;
  defaultBranchId?: string | null;
  listHref?: string;
}

export function InventoryProductForm({
  branches,
  defaultBranchId,
  listHref = '/inventario',
}: InventoryProductFormProps) {
  const [state, formAction, pending] = useActionState(createInventoryProduct, null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('medicamento');
  const [unit, setUnit] = useState<string>('unidad');
  const sessionBranch = branches.find((branch) => branch.id === defaultBranchId);

  const applyPreset = (presetName: string) => {
    const preset = INVENTORY_PRODUCT_PRESETS.find((item) => item.name === presetName);
    if (!preset) return;
    setName(preset.name);
    setCategory(preset.category);
    setUnit(preset.unit);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo producto</CardTitle>
        {sessionBranch ? (
          <p className="text-sm text-muted-foreground">
            Se crea en la sucursal de tu sesión: {sessionBranch.name}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-2xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="preset">Plantilla rápida</Label>
            <Select id="preset" defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">—</option>
              {INVENTORY_PRODUCT_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </Select>
          </div>

          {sessionBranch ? (
            <input type="hidden" name="branchId" value={sessionBranch.id} />
          ) : branches.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal *</Label>
              <Select id="branchId" name="branchId" required defaultValue="">
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {state?.fieldErrors?.name?.[0] && (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Fabricante</Label>
              <Input id="manufacturer" name="manufacturer" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Categoría *</Label>
              <Select
                id="category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {INVENTORY_PRODUCT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {INVENTORY_PRODUCT_CATEGORY_LABELS[item]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unidad *</Label>
              <Select id="unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {INVENTORY_UNITS.map((item) => (
                  <option key={item} value={item}>
                    {INVENTORY_UNIT_LABELS[item]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity">Stock inicial</Label>
              <Input id="quantity" name="quantity" type="number" min="0" step="any" defaultValue="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minQuantity">Stock mínimo</Label>
              <Input
                id="minQuantity"
                name="minQuantity"
                type="number"
                min="0"
                step="any"
                defaultValue="0"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unitCost">Costo unitario</Label>
              <Input id="unitCost" name="unitCost" type="number" min="0" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Precio de venta</Label>
              <Input id="unitPrice" name="unitPrice" type="number" min="0" step="0.01" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          <input type="hidden" name="isActive" value="true" />

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Creando...' : 'Crear producto'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={listHref}>Cancelar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
