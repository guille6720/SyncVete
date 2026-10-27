'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { receiveInventoryPurchaseAction } from '@/actions/purchases';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  INVENTORY_UNIT_LABELS,
  type InventoryProductListRow,
} from '@sincvete/shared';

interface PurchaseFormProps {
  branches: Array<{ id: string; name: string }>;
  products: InventoryProductListRow[];
  defaultBranchId?: string | null;
  listHref?: string;
}

interface LineItem {
  productId: string;
  quantity: string;
  unitCost: string;
  lotNumber: string;
  expiresAt: string;
}

function emptyLine(): LineItem {
  return { productId: '', quantity: '1', unitCost: '', lotNumber: '', expiresAt: '' };
}

function formatMoney(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PurchaseForm({
  branches,
  products,
  defaultBranchId,
  listHref = '/compras',
}: PurchaseFormProps) {
  const [state, formAction, pending] = useActionState(receiveInventoryPurchaseAction, null);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);

  const productById = useMemo(() => {
    const map = new Map<string, InventoryProductListRow>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const total = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.unitCost) || 0;
    return sum + qty * cost;
  }, 0);

  const updateLine = (index: number, patch: Partial<LineItem>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const onProductChange = (index: number, productId: string) => {
    const product = productById.get(productId);
    updateLine(index, {
      productId,
      unitCost:
        product?.unit_cost != null && product.unit_cost >= 0
          ? String(product.unit_cost)
          : items[index]?.unitCost ?? '',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva compra</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid max-w-4xl gap-4">
          {state?.error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">Sucursal *</Label>
              <Select id="branchId" name="branchId" required defaultValue={defaultBranchId ?? ''}>
                <option value="">—</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
              {state?.fieldErrors?.branchId?.[0] && (
                <p className="text-sm text-destructive">{state.fieldErrors.branchId[0]}</p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplierName">Proveedor *</Label>
              <Input
                id="supplierName"
                name="supplierName"
                required
                maxLength={160}
                placeholder="Ej. Distribuidora Vet Sur"
              />
              {state?.fieldErrors?.supplierName?.[0] && (
                <p className="text-sm text-destructive">{state.fieldErrors.supplierName[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Nº factura / remito</Label>
              <Input id="invoiceNumber" name="invoiceNumber" maxLength={80} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchasedAt">Fecha de compra</Label>
            <Input
              id="purchasedAt"
              name="purchasedAt"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Productos *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((current) => [...current, emptyLine()])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>

            {products.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No hay productos activos en esta sucursal.{' '}
                <Link href="/inventario/nuevo" className="underline underline-offset-2">
                  Creá un producto
                </Link>{' '}
                antes de registrar la compra.
              </p>
            )}

            {items.map((item, index) => {
              const product = productById.get(item.productId);
              return (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12">
                  <div className="space-y-2 sm:col-span-5">
                    <Label htmlFor={`productId_${index}`}>Producto *</Label>
                    <Select
                      id={`productId_${index}`}
                      name="productId"
                      required
                      value={item.productId}
                      onChange={(e) => onProductChange(index, e.target.value)}
                    >
                      <option value="">—</option>
                      {products.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                          {entry.sku ? ` (${entry.sku})` : ''} · stock {entry.quantity}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`quantity_${index}`}>
                      Cantidad{product ? ` (${INVENTORY_UNIT_LABELS[product.unit]})` : ''} *
                    </Label>
                    <Input
                      id={`quantity_${index}`}
                      name="quantity"
                      type="number"
                      min="0.001"
                      step="any"
                      required
                      value={item.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`unitCost_${index}`}>Costo unit.</Label>
                    <Input
                      id={`unitCost_${index}`}
                      name="unitCost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`lotNumber_${index}`}>Lote</Label>
                    <Input
                      id={`lotNumber_${index}`}
                      name="lotNumber"
                      value={item.lotNumber}
                      onChange={(e) => updateLine(index, { lotNumber: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={items.length <= 1}
                      onClick={() =>
                        setItems((current) => current.filter((_, i) => i !== index))
                      }
                      aria-label="Quitar ítem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2 sm:col-span-4">
                    <Label htmlFor={`expiresAt_${index}`}>Vencimiento</Label>
                    <Input
                      id={`expiresAt_${index}`}
                      name="expiresAt"
                      type="date"
                      value={item.expiresAt}
                      onChange={(e) => updateLine(index, { expiresAt: e.target.value })}
                    />
                  </div>
                  {product && (
                    <p className="text-xs text-muted-foreground sm:col-span-8">
                      Stock actual: {product.quantity.toLocaleString('es-AR', { maximumFractionDigits: 3 })}
                      {product.is_low_stock ? ' · stock bajo' : ''}
                    </p>
                  )}
                </div>
              );
            })}

            {state?.fieldErrors?.items?.[0] && (
              <p className="text-sm text-destructive">{state.fieldErrors.items[0]}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Total estimado:{' '}
              <span className="font-medium text-foreground">{formatMoney(total)}</span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" asChild>
                <Link href={listHref}>Cancelar</Link>
              </Button>
              <Button type="submit" disabled={pending || products.length === 0}>
                {pending ? 'Registrando…' : 'Recibir compra'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
