'use client';

import { startTransition, useActionState, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Syringe,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { updateCatalogPricing } from '@/actions/purchase-catalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CatalogDelete } from '@/components/purchases/catalog-management';
import { ComprasSectionNav } from '@/components/purchases/compras-catalog';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  formatProductAmount,
  INVENTORY_PRODUCT_CATEGORIES,
  INVENTORY_PRODUCT_CATEGORY_LABELS,
  INVENTORY_UNIT_LABELS,
  resolveProductSalePrice,
  type CatalogProductRow,
  type PaginatedResult,
  type ProductCurrency,
  type PurchaseCategory,
  type PurchaseParty,
} from '@sincvete/shared';
import styles from './compras-workspace.module.css';

export interface ComprasWorkspaceProps {
  parties: PaginatedResult<PurchaseParty>;
  products: PaginatedResult<CatalogProductRow>;
  vaccines: PaginatedResult<CatalogProductRow>;
  prices: PaginatedResult<CatalogProductRow>;
  categories: PurchaseCategory[];
  suppliers: Array<{ id: string; name: string; kind: string; scope: string }>;
  exchangeRate: number | null;
  canWrite: boolean;
}

function QuerySearch({ name, label }: { name: string; label: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const current = params.get(name) ?? '';
  const [search, setSearch] = useState(current);
  const debounced = useDebouncedValue(search);
  const [urlValue, setUrlValue] = useState(current);
  if (urlValue !== current) {
    setUrlValue(current);
    if (current !== debounced) setSearch(current);
  }
  useEffect(() => {
    if (debounced !== search || debounced === current) return;
    const next = new URLSearchParams(params.toString());
    if (debounced) next.set(name, debounced);
    else next.delete(name);
    next.delete(`${name.replace('Buscar', '')}Pagina`);
    router.replace(`/compras?${next.toString()}`, { scroll: false });
  }, [debounced, search, current, name, params, router]);
  return (
    <div className="relative min-w-40 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-9 pl-9 text-xs"
        type="search"
        aria-label={label}
        placeholder={label}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );
}

function QuerySelect({
  name,
  label,
  options,
  pageKey,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  pageKey: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <Select
      className="h-9 w-auto min-w-36 max-w-full text-xs"
      aria-label={label}
      value={params.get(name) ?? ''}
      onChange={(event) => {
        const next = new URLSearchParams(params.toString());
        if (event.target.value) next.set(name, event.target.value);
        else next.delete(name);
        next.delete(pageKey);
        router.replace(`/compras?${next.toString()}`, { scroll: false });
      }}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

function Pagination({
  data,
  name,
}: {
  data: { page: number; totalPages: number; total: number };
  name: string;
}) {
  const params = useSearchParams();
  if (data.totalPages <= 1) return null;
  const href = (page: number) => {
    const next = new URLSearchParams(params.toString());
    next.set(name, String(page));
    return `/compras?${next.toString()}`;
  };
  return (
    <nav
      aria-label={`Paginación ${name}`}
      className="mt-3 flex items-center justify-between text-xs text-muted-foreground"
    >
      <span>
        {data.total} registros · {data.page} / {data.totalPages}
      </span>
      <div className="flex gap-2">
        {data.page > 1 && (
          <Link aria-label="Página anterior" href={href(data.page - 1)} scroll={false}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        )}
        {data.page < data.totalPages && (
          <Link aria-label="Página siguiente" href={href(data.page + 1)} scroll={false}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </nav>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={styles.panel}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <Icon className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-bold leading-6 tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function AddButton({
  href,
  label,
  outline = false,
  icon: Icon = Plus,
}: {
  href: string;
  label: string;
  outline?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <Button asChild size="sm" className="h-9 text-xs" variant={outline ? 'outline' : 'default'}>
      <Link href={href}>
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}

function PartiesTable({
  data,
  canWrite,
}: {
  data: PaginatedResult<PurchaseParty>;
  canWrite: boolean;
}) {
  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className={styles.table}>
          <thead>
            <tr>
              {['Nombre', 'Tipo', 'CUIT', 'Teléfono', 'Email', 'Acciones'].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((party) => (
              <tr key={party.id}>
                <td className="min-w-40 font-medium">
                  <Link href={`/compras/partes/${party.id}`}>{party.name}</Link>
                  {!party.is_active && (
                    <span className="ml-2 text-muted-foreground">(inactivo)</span>
                  )}
                </td>
                <td>
                  <span
                    className={`rounded px-2 py-1 text-[11px] ${party.kind === 'proveedor' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'}`}
                  >
                    {party.kind === 'proveedor' ? 'Proveedor' : 'Prestador'}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  {party.cuit
                    ? `${party.cuit.slice(0, 2)}-${party.cuit.slice(2, 10)}-${party.cuit.slice(10)}`
                    : '—'}
                </td>
                <td className="whitespace-nowrap">{party.phone || '—'}</td>
                <td>{party.email || '—'}</td>
                <td>
                  {canWrite ? (
                    <div className="flex gap-1">
                      <Link
                        className="rounded p-1.5 hover:bg-muted"
                        aria-label={`Editar ${party.name}`}
                        href={`/compras/partes/${party.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <CatalogDelete id={party.id} kind="party" compact label={party.name} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Solo lectura</span>
                  )}
                </td>
              </tr>
            ))}
            {!data.data.length && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground">
                  No hay prestadores o proveedores con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination data={data} name="partesPagina" />
    </>
  );
}

function PricingRow({
  product,
  canWrite,
  exchangeRate,
  vaccine,
}: {
  product: CatalogProductRow;
  canWrite: boolean;
  exchangeRate: number | null;
  vaccine: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateCatalogPricing.bind(null, product.id),
    null
  );
  const [cost, setCost] = useState(product.unit_cost == null ? '' : String(product.unit_cost));
  const [currency, setCurrency] = useState<ProductCurrency>(product.cost_currency);
  const [margin, setMargin] = useState(
    product.margin_percent == null ? '' : String(product.margin_percent)
  );
  const formId = `pricing-${product.id}`;
  const price =
    cost !== '' && margin !== ''
      ? resolveProductSalePrice({
          unitCost: Number(cost),
          marginPercent: Number(margin),
          costCurrency: currency,
          exchangeRate,
        })
      : product.unit_price;
  return (
    <tr>
      <td className="min-w-40">
        <Link
          href={`/inventario/${product.id}?from=compras&return=${encodeURIComponent(vaccine ? 'seccion=vacunas' : 'seccion=productos')}`}
          className="flex items-center gap-2 font-medium"
        >
          {vaccine ? (
            <Syringe className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <Package className="h-5 w-5 shrink-0 text-primary" />
          )}
          {product.name}
        </Link>
        {state?.error && (
          <p role="alert" className="mt-1 max-w-64 text-xs text-destructive">
            {state.error}
          </p>
        )}
        {state?.success && (
          <span role="status" className="text-[11px] text-primary">
            Precio guardado
          </span>
        )}
      </td>
      {!vaccine && (
        <td>
          <span className="whitespace-nowrap rounded bg-primary/10 px-2 py-1 text-[11px] text-primary">
            {product.catalog_category_name ?? INVENTORY_PRODUCT_CATEGORY_LABELS[product.category]}
          </span>
        </td>
      )}
      <td>{product.supplier_name || '—'}</td>
      {vaccine && (
        <td className="whitespace-nowrap">1 {INVENTORY_UNIT_LABELS[product.unit].toLowerCase()}</td>
      )}
      <td>
        {canWrite ? (
          <Input
            form={formId}
            aria-label={`Costo de ${product.name}`}
            name="unitCost"
            type="number"
            step="0.01"
            min="0"
            className="w-24"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        ) : (
          formatProductAmount(product.unit_cost, product.cost_currency)
        )}
      </td>
      <td>
        {canWrite ? (
          <Select
            form={formId}
            aria-label={`Moneda de ${product.name}`}
            name="costCurrency"
            className="w-16"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as ProductCurrency)}
          >
            <option>ARS</option>
            <option>USD</option>
          </Select>
        ) : (
          currency
        )}
      </td>
      <td>
        {canWrite ? (
          <Input
            form={formId}
            aria-label={`Ganancia de ${product.name}`}
            name="marginPercent"
            type="number"
            step="0.01"
            min="0"
            max="1000"
            className="w-16"
            value={margin}
            onChange={(event) => setMargin(event.target.value)}
          />
        ) : (
          `${product.margin_percent ?? '—'}%`
        )}
      </td>
      <td className="whitespace-nowrap font-semibold">{formatProductAmount(price, 'ARS')}</td>
      <td>
        {canWrite && (
          <div className="flex gap-1">
            <form
              id={formId}
              action={action}
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startTransition(() => action(formData));
              }}
            >
              <Button
                size="icon"
                type="submit"
                variant="ghost"
                className="h-7 w-7"
                disabled={pending}
                aria-label={`Guardar precio de ${product.name}`}
              >
                {state?.success ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
              </Button>
            </form>
            <Link
              className="rounded p-1.5 hover:bg-muted"
              aria-label={`Editar ${product.name}`}
              href={`/inventario/${product.id}?from=compras`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
            <CatalogDelete id={product.id} kind="product" compact label={product.name} />
          </div>
        )}
      </td>
    </tr>
  );
}

function ProductsTable({
  data,
  canWrite,
  exchangeRate,
  vaccine = false,
}: {
  data: PaginatedResult<CatalogProductRow>;
  canWrite: boolean;
  exchangeRate: number | null;
  vaccine?: boolean;
}) {
  const labels = vaccine
    ? [
        'Vacuna',
        'Laboratorio / Proveedor',
        'Presentación',
        'Costo',
        'Moneda',
        '% Ganancia',
        'Precio de venta',
        'Acciones',
      ]
    : [
        'Producto',
        'Categoría',
        'Proveedor',
        'Costo',
        'Moneda',
        '% Ganancia',
        'Precio de venta',
        'Acciones',
      ];
  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className={styles.table}>
          <thead>
            <tr>
              {labels.map((label) => (
                <th key={label} className="whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((product) => (
              <PricingRow
                key={product.id}
                product={product}
                canWrite={canWrite}
                exchangeRate={exchangeRate}
                vaccine={vaccine}
              />
            ))}
            {!data.data.length && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground">
                  {vaccine
                    ? 'No hay vacunas con esos filtros.'
                    : 'No hay productos con esos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination data={data} name={vaccine ? 'vacunasPagina' : 'productosPagina'} />
    </>
  );
}

export function SalePriceCalculator({ exchangeRate }: { exchangeRate: number | null }) {
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState<ProductCurrency>('ARS');
  const [margin, setMargin] = useState('30');
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState('');
  return (
    <Panel title="Cálculo de precio de venta" icon={Calculator}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const calculated = resolveProductSalePrice({
            unitCost: Number(cost),
            costCurrency: currency,
            marginPercent: Number(margin),
            exchangeRate,
          });
          if (calculated == null) {
            setError('Configurá la cotización USD/ARS en Precios de venta.');
            setResult(null);
            return;
          }
          setResult(calculated);
          setError('');
        }}
      >
        <div className={`${styles.calculator} space-y-3`}>
          <div className="grid grid-cols-[minmax(0,1fr)_82px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="calculatorCost">
                Costo del producto
              </Label>
              <Input
                id="calculatorCost"
                required
                type="number"
                step="0.01"
                min="0"
                value={cost}
                placeholder="0,00"
                onChange={(event) => {
                  setCost(event.target.value);
                  setResult(null);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="calculatorCurrency">
                Moneda
              </Label>
              <Select
                id="calculatorCurrency"
                value={currency}
                onChange={(event) => {
                  setCurrency(event.target.value as ProductCurrency);
                  setResult(null);
                }}
              >
                <option>ARS</option>
                <option>USD</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="calculatorMargin">
              % de ganancia
            </Label>
            <Input
              id="calculatorMargin"
              required
              type="number"
              step="0.01"
              min="0"
              max="1000"
              value={margin}
              onChange={(event) => {
                setMargin(event.target.value);
                setResult(null);
              }}
            />
          </div>
        </div>
        <div className={`${styles.calculator} my-3 flex items-center justify-between gap-2`}>
          <div>
            <p className="text-sm font-bold text-primary">Precio de venta</p>
            <p className="text-[11px] text-muted-foreground">En ARS · recargo sobre el costo</p>
          </div>
          <output aria-label="Resultado de cálculo" className="shrink-0 whitespace-nowrap text-lg font-bold text-primary">
            {formatProductAmount(result, 'ARS')}
          </output>
        </div>
        {currency === 'USD' && (
          <p className="mb-2 text-xs text-muted-foreground">
            {exchangeRate
              ? `1 USD = ${formatProductAmount(exchangeRate)}`
              : 'Todavía no hay una cotización configurada.'}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full text-xs">
          <Calculator className="h-4 w-4" />
          Calcular precio
        </Button>
      </form>
    </Panel>
  );
}

export function ComprasWorkspace({
  parties,
  products,
  vaccines,
  prices,
  categories,
  suppliers,
  exchangeRate,
  canWrite,
}: ComprasWorkspaceProps) {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <div className={`${styles.root} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-4">
          <ShoppingCart className="mt-0.5 h-10 w-10 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Compras</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gestioná tus prestadores, proveedores, productos y vacunas. Controlá costos y precios
              de venta.
            </p>
          </div>
        </div>
        {canWrite && <AddButton href="/compras/nueva" label="Nueva compra" />}
      </div>
      <ComprasSectionNav active="compras" />
      <div className={styles.layout}>
        <div className="min-w-0 space-y-4">
          <Panel
            title="Prestadores / Proveedores"
            subtitle="Administrá tus prestadores de servicios y proveedores de productos."
            icon={Users}
            actions={
              canWrite && (
                <div className="flex gap-2">
                  <AddButton
                    href="/compras/partes/nueva?tipo=prestador"
                    label="Agregar prestador"
                    icon={Users}
                  />
                  <AddButton
                    href="/compras/partes/nueva?tipo=proveedor"
                    label="Agregar proveedor"
                    icon={Truck}
                    outline
                  />
                </div>
              )
            }
          >
            <div className="mb-2 flex flex-wrap gap-2">
              <QuerySearch name="partesBuscar" label="Buscar prestadores o proveedores..." />
              <QuerySelect
                name="tipo"
                label="Todos los tipos"
                pageKey="partesPagina"
                options={[
                  { value: 'prestador', label: 'Prestadores' },
                  { value: 'proveedor', label: 'Proveedores' },
                ]}
              />
            </div>
            <PartiesTable data={parties} canWrite={canWrite} />
          </Panel>
          <Panel
            title="Productos"
            subtitle="Listado de productos por categoría. Controlá costos, proveedores y precios de venta."
            icon={Package}
            actions={
              canWrite && <AddButton href="/compras/productos/nuevo" label="Agregar producto" />
            }
          >
            <div className="mb-2 flex flex-wrap gap-2">
              <QuerySearch name="productosBuscar" label="Buscar productos..." />
              <QuerySelect
                name="productoCategoria"
                label="Todas las categorías"
                pageKey="productosPagina"
                options={[
                  ...INVENTORY_PRODUCT_CATEGORIES.filter((category) => category !== 'vacuna').map(
                    (category) => ({
                      value: `base:${category}`,
                      label: INVENTORY_PRODUCT_CATEGORY_LABELS[category],
                    })
                  ),
                  ...categories
                    .filter((category) => category.base_category !== 'vacuna')
                    .map((category) => ({ value: category.id, label: category.name })),
                ]}
              />
              <QuerySelect
                name="productoProveedor"
                label="Todos los proveedores de productos"
                pageKey="productosPagina"
                options={suppliers
                  .filter(
                    (supplier) => supplier.kind === 'proveedor' && supplier.scope === 'general'
                  )
                  .map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  const next = new URLSearchParams(params.toString());
                  for (const key of [
                    'productosBuscar',
                    'productoCategoria',
                    'productoProveedor',
                    'productosPagina',
                  ])
                    next.delete(key);
                  router.push(`/compras?${next.toString()}`, { scroll: false });
                }}
              >
                <List className="h-3 w-3" />
                Limpiar filtros
              </Button>
            </div>
            <ProductsTable data={products} canWrite={canWrite} exchangeRate={exchangeRate} />
          </Panel>
          <Panel
            title="Vacunas"
            subtitle="Gestión de vacunas y sus proveedores. Controlá costos y precios de aplicación."
            icon={Syringe}
            actions={
              canWrite && (
                <AddButton
                  href="/compras/productos/nuevo?categoria=vacuna&lock=1"
                  label="Agregar vacuna"
                />
              )
            }
          >
            <div className="mb-2 flex flex-wrap gap-2">
              <QuerySearch name="vacunasBuscar" label="Buscar vacunas..." />
              <QuerySelect
                name="vacunaProveedor"
                label="Todos los proveedores de vacunas"
                pageKey="vacunasPagina"
                options={suppliers
                  .filter(
                    (supplier) => supplier.kind === 'proveedor' && supplier.scope === 'vacunas'
                  )
                  .map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              />
            </div>
            <ProductsTable
              data={vaccines}
              canWrite={canWrite}
              exchangeRate={exchangeRate}
              vaccine
            />
          </Panel>
        </div>
        <aside aria-label="Calculadora y valores de venta" className="min-w-0 space-y-4">
          <SalePriceCalculator exchangeRate={exchangeRate} />
          <Panel title="Valores para vender" icon={Tags}>
            <QuerySearch name="preciosBuscar" label="Buscar precio de producto..." />
            <div className="mt-3 overflow-x-auto rounded border">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-right">Precio de venta</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.data.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <Link href={`/inventario/${product.id}?from=compras`}>{product.name}</Link>
                      </td>
                      <td className="whitespace-nowrap text-right font-semibold">
                        {formatProductAmount(product.unit_price, 'ARS')}
                      </td>
                    </tr>
                  ))}
                  {!prices.data.length && (
                    <tr>
                      <td colSpan={2} className="text-muted-foreground">
                        No hay precios con esa búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination data={prices} name="preciosPagina" />
            <Button asChild variant="outline" className="mt-4 w-full text-xs">
              <Link href="/compras?seccion=precios">
                <List className="h-4 w-4" />
                Ver todos los valores
              </Link>
            </Button>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
