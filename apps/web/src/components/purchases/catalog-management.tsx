'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { softDeleteInventoryProduct } from '@/actions/inventory';
import {
  deletePurchaseCategory,
  deletePurchaseParty,
  savePurchaseCategory,
  savePurchaseExchangeRate,
} from '@/actions/purchase-catalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  INVENTORY_PRODUCT_CATEGORIES,
  INVENTORY_PRODUCT_CATEGORY_LABELS,
  type PurchaseCategory,
} from '@sincvete/shared';

export function CatalogDelete({
  id,
  kind,
  returnHref,
  compact = false,
  label,
}: {
  id: string;
  kind: 'party' | 'category' | 'product';
  returnHref?: string;
  compact?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button
        type="button"
        variant={compact ? 'ghost' : 'destructive'}
        size={compact ? 'icon' : 'default'}
        className={compact ? 'h-7 w-7 text-destructive' : undefined}
        aria-label={compact ? `Eliminar ${label ?? 'registro'}` : undefined}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {compact ? <Trash2 className="h-3.5 w-3.5" /> : 'Eliminar'}
      </Button>
      <ConfirmDialog
        open={open}
        title="Eliminar registro"
        description="El registro se ocultará del catálogo. Si tiene productos vinculados, primero deberás desvincularlos."
        confirmLabel="Eliminar"
        variant="destructive"
        onClose={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await (kind === 'product'
              ? softDeleteInventoryProduct(id)
              : kind === 'party'
                ? deletePurchaseParty(id)
                : deletePurchaseCategory(id));
            setOpen(false);
            if (!result.success) setError(result.error || 'No se pudo eliminar');
            else if (returnHref) router.push(returnHref);
            else router.refresh();
          })
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

export function ExchangeRateForm({ rate, canWrite }: { rate: number | null; canWrite: boolean }) {
  const [state, action, pending] = useActionState(savePurchaseExchangeRate, null);
  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      <Label htmlFor="usdArs">Cotización: pesos por 1 USD</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          id="usdArs"
          name="usdArs"
          type="number"
          step="0.0001"
          min="0.0001"
          max="999999999"
          required
          defaultValue={rate ?? ''}
          disabled={!canWrite}
        />
        {canWrite && <Button disabled={pending}>Guardar cotización</Button>}
      </div>
      <p className="text-sm text-muted-foreground">
        Los precios de venta están en ARS. Al guardar se actualizan los productos con costo en USD y
        porcentaje de ganancia. Los precios manuales se conservan.
      </p>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.success && <p role="status">Cotización guardada y precios actualizados.</p>}
    </form>
  );
}

function CategoryEditor({ category }: { category?: PurchaseCategory }) {
  const [state, action, pending] = useActionState(savePurchaseCategory, null);
  const suffix = category?.id ?? 'new';
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input name="id" type="hidden" value={category?.id ?? ''} />
      <div className="space-y-2">
        <Label htmlFor={`name-${suffix}`}>Nombre de categoría</Label>
        <Input
          id={`name-${suffix}`}
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={category?.name ?? ''}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`base-${suffix}`}>Tipo de producto</Label>
        <Select
          id={`base-${suffix}`}
          name="baseCategory"
          defaultValue={category?.base_category ?? 'otro'}
        >
          {INVENTORY_PRODUCT_CATEGORIES.map((base) => (
            <option key={base} value={base}>
              {INVENTORY_PRODUCT_CATEGORY_LABELS[base]}
            </option>
          ))}
        </Select>
      </div>
      <Button disabled={pending}>{category ? 'Guardar categoría' : 'Agregar categoría'}</Button>
      {state?.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="w-full text-sm">
          Categoría guardada.
        </p>
      )}
    </form>
  );
}

export function CategoryManager({
  categories,
  canWrite,
}: {
  categories: PurchaseCategory[];
  canWrite: boolean;
}) {
  const [search, setSearch] = useState('');
  const visible = categories.filter((category) =>
    `${category.name} ${INVENTORY_PRODUCT_CATEGORY_LABELS[category.base_category]}`
      .toLocaleLowerCase('es')
      .includes(search.toLocaleLowerCase('es'))
  );
  return (
    <section className="space-y-4">
      <Input
        aria-label="Buscar categorías"
        placeholder="Buscar categorías..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {canWrite && (
        <div className="rounded-lg border p-4">
          <CategoryEditor />
        </div>
      )}
      {visible.map((category) => (
        <div key={category.id} className="space-y-3 rounded-lg border p-4">
          {canWrite ? (
            <>
              <CategoryEditor category={category} />
              <CatalogDelete id={category.id} kind="category" />
            </>
          ) : (
            <p>
              {category.name} · {INVENTORY_PRODUCT_CATEGORY_LABELS[category.base_category]}
            </p>
          )}
        </div>
      ))}
      {visible.length === 0 && (
        <p className="text-muted-foreground">
          No hay categorías con esa búsqueda. Los tipos generales siguen disponibles.
        </p>
      )}
    </section>
  );
}

export function CatalogCategorySelect({
  categories,
  category,
  defaultId,
}: {
  categories: PurchaseCategory[];
  category: string;
  defaultId?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="catalogCategoryId">Categoría personalizada</Label>
      <Select
        key={category}
        id="catalogCategoryId"
        name="catalogCategoryId"
        defaultValue={
          categories.some((item) => item.id === defaultId && item.base_category === category)
            ? defaultId!
            : ''
        }
      >
        <option value="">Sin categoría personalizada</option>
        {categories
          .filter((item) => item.base_category === category)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </Select>
    </div>
  );
}
