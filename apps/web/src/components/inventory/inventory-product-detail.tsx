'use client';

import type { ReactNode } from 'react';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  recordInventoryMovementAction,
  softDeleteInventoryProduct,
  updateInventoryProduct,
} from '@/actions/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_MOVEMENT_TYPE_LABELS,
  INVENTORY_MOVEMENT_TYPE_VARIANT,
  INVENTORY_PRODUCT_CATEGORIES,
  INVENTORY_PRODUCT_CATEGORY_LABELS,
  INVENTORY_UNITS,
  INVENTORY_UNIT_LABELS,
  formatClinicalEntryDateTime,
  type InventoryMovementListRow,
  type InventoryProductListRow,
} from '@sincvete/shared';

interface InventoryProductDetailProps {
  product: InventoryProductListRow;
  movements: InventoryMovementListRow[];
  canWrite: boolean;
  listHref?: string;
}

function formatQty(value: number): string {
  return Number(value).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InventoryProductDetail({
  product,
  movements,
  canWrite,
  listHref = '/inventario',
}: InventoryProductDetailProps) {
  const router = useRouter();
  const updateAction = updateInventoryProduct.bind(null, product.id);
  const movementAction = recordInventoryMovementAction.bind(null, product.id);
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, null);
  const [movementState, movementFormAction, movementPending] = useActionState(movementAction, null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = async () => {
    setActionError(null);
    setDeletePending(true);
    try {
      const result = await softDeleteInventoryProduct(product.id);
      if (!result.success) {
        setActionError(result.error ?? 'No se pudo eliminar el producto');
        return;
      }
      router.push(listHref);
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Eliminar producto"
        description="¿Eliminar este producto del inventario?"
        confirmLabel="Eliminar"
        variant="destructive"
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void handleDelete();
        }}
      />
      <ConfirmDialog
        open={Boolean(actionError)}
        mode="alert"
        title="No se pudo completar"
        description={actionError ?? ''}
        onClose={() => setActionError(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={listHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a inventario
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{product.name}</CardTitle>
            <Badge variant="default">{INVENTORY_PRODUCT_CATEGORY_LABELS[product.category]}</Badge>
            {product.is_low_stock && <Badge variant="destructive">Stock bajo</Badge>}
            {!product.is_active && <Badge variant="warning">Inactivo</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatQty(product.quantity)} {INVENTORY_UNIT_LABELS[product.unit]}
            {' · '}
            mín. {formatQty(product.min_quantity)}
            {product.sku ? ` · SKU ${product.sku}` : ''}
          </p>
        </CardHeader>
        {!canWrite && (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Fabricante" value={product.manufacturer} />
            <DetailField label="Costo" value={formatMoney(product.unit_cost)} />
            <DetailField label="Precio" value={formatMoney(product.unit_price)} />
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={product.notes} />
            </div>
          </CardContent>
        )}
      </Card>

      {canWrite && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Datos del producto</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateFormAction} className="grid max-w-3xl gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input id="name" name="name" required defaultValue={product.name} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" name="sku" defaultValue={product.sku ?? ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manufacturer">Fabricante</Label>
                    <Input
                      id="manufacturer"
                      name="manufacturer"
                      defaultValue={product.manufacturer ?? ''}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoría</Label>
                    <Select id="category" name="category" defaultValue={product.category}>
                      {INVENTORY_PRODUCT_CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {INVENTORY_PRODUCT_CATEGORY_LABELS[item]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unidad</Label>
                    <Select id="unit" name="unit" defaultValue={product.unit}>
                      {INVENTORY_UNITS.map((item) => (
                        <option key={item} value={item}>
                          {INVENTORY_UNIT_LABELS[item]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="minQuantity">Stock mínimo</Label>
                    <Input
                      id="minQuantity"
                      name="minQuantity"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={product.min_quantity}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unitCost">Costo</Label>
                    <Input
                      id="unitCost"
                      name="unitCost"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={product.unit_cost ?? ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unitPrice">Precio</Label>
                    <Input
                      id="unitPrice"
                      name="unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={product.unit_price ?? ''}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea id="notes" name="notes" rows={2} defaultValue={product.notes ?? ''} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={product.is_active} />
                  Producto activo
                </label>
                {updateState?.error && <p className="text-sm text-destructive">{updateState.error}</p>}
                {updateState?.success && (
                  <p className="text-sm text-muted-foreground">Producto actualizado.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={updatePending}>
                    {updatePending ? 'Guardando...' : 'Guardar'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deletePending}
                    isPending={deletePending}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    Eliminar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registrar movimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={movementFormAction} className="grid max-w-3xl gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="movementType">Tipo *</Label>
                    <Select id="movementType" name="movementType" defaultValue="entrada">
                      {INVENTORY_MOVEMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {INVENTORY_MOVEMENT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      En ajuste, la cantidad es el stock absoluto nuevo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Cantidad *</Label>
                    <Input id="quantity" name="quantity" type="number" min="0" step="any" required />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lotNumber">Lote</Label>
                    <Input id="lotNumber" name="lotNumber" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiresAt">Vencimiento</Label>
                    <Input id="expiresAt" name="expiresAt" type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Motivo</Label>
                  <Textarea id="reason" name="reason" rows={2} />
                </div>
                {movementState?.error && (
                  <p className="text-sm text-destructive">{movementState.error}</p>
                )}
                {movementState?.success && (
                  <p className="text-sm text-muted-foreground">Movimiento registrado.</p>
                )}
                <Button type="submit" disabled={movementPending}>
                  {movementPending ? 'Registrando...' : 'Registrar'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Movimientos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
          ) : (
            <div className="space-y-2">
              {movements.map((movement) => (
                <div key={movement.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={INVENTORY_MOVEMENT_TYPE_VARIANT[movement.movement_type]}>
                      {INVENTORY_MOVEMENT_TYPE_LABELS[movement.movement_type]}
                    </Badge>
                    <span className="font-medium">{formatQty(movement.quantity)}</span>
                    <span className="text-muted-foreground">
                      {formatQty(movement.quantity_before)} → {formatQty(movement.quantity_after)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {formatClinicalEntryDateTime(movement.created_at)}
                    {movement.performed_by_name ? ` · ${movement.performed_by_name}` : ''}
                    {movement.lot_number ? ` · Lote ${movement.lot_number}` : ''}
                  </p>
                  {movement.reason && <p className="mt-1 whitespace-pre-wrap">{movement.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{value || '—'}</div>
    </div>
  );
}
