'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  Package,
  Tags,
  Syringe,
  List,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  COMPRAS_SECTIONS,
  COMPRAS_SECTION_LABELS,
  INVENTORY_PRODUCT_CATEGORIES,
  INVENTORY_PRODUCT_CATEGORY_LABELS,
  INVENTORY_UNIT_LABELS,
  formatProductAmount,
  type CatalogProductRow,
  type ComprasSection,
  type PaginatedResult,
  type PurchaseParty,
  type PurchaseCategory,
} from '@sincvete/shared';

export function ComprasSectionNav({ active }: { active: ComprasSection }) {
  const icons = {
    compras: Users,
    historial: ShoppingCart,
    proveedores: Users,
    prestadores: UserRound,
    productos: Package,
    categorias: Tags,
    vacunas: Syringe,
    precios: List,
  };
  const sections = COMPRAS_SECTIONS.filter(
    (section) => section !== 'proveedores' && section !== 'prestadores'
  );
  return (
    <nav
      aria-label="Secciones de Compras"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
    >
      {sections.map((section) => {
        const Icon = icons[section];
        const selected =
          section === active ||
          (section === 'compras' && (active === 'proveedores' || active === 'prestadores'));
        return (
          <Button
            className={`h-auto min-h-14 whitespace-normal border p-3 text-xs shadow-none ${selected ? 'border-primary bg-primary/10 text-primary hover:bg-primary/15' : 'bg-card'}`}
            key={section}
            variant="outline"
            asChild
          >
            <Link
              aria-current={selected ? 'page' : undefined}
              href={section === 'compras' ? '/compras' : `/compras?seccion=${section}`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              {section === 'compras'
                ? 'Prestadores / Proveedores'
                : COMPRAS_SECTION_LABELS[section]}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function ProductCategoryNav({ active }: { active: string }) {
  const categories = INVENTORY_PRODUCT_CATEGORIES.filter((category) => category !== 'vacuna');
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant={active ? 'outline' : 'default'} size="sm" asChild>
        <Link href="/compras?seccion=productos">Todas</Link>
      </Button>
      {categories.map((category) => (
        <Button
          key={category}
          variant={active === category ? 'default' : 'outline'}
          size="sm"
          asChild
        >
          <Link href={`/compras?seccion=productos&categoria=${category}`}>
            {INVENTORY_PRODUCT_CATEGORY_LABELS[category]}
          </Link>
        </Button>
      ))}
    </div>
  );
}

export function CatalogSearch({
  initialSearch = '',
  placeholder,
}: {
  initialSearch?: string;
  placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebouncedValue(search);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = searchParams.get('buscar') ?? '';
    if (debouncedSearch === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) params.set('buscar', debouncedSearch);
    else params.delete('buscar');
    params.delete('pagina');
    params.delete('paginaPartes');
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [debouncedSearch, pathname, router, searchParams]);

  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="pl-9"
      />
    </div>
  );
}

function CatalogPagination({
  page,
  totalPages,
  paramName,
}: {
  page: number;
  totalPages: number;
  paramName: 'pagina' | 'paginaPartes';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (totalPages <= 1) return null;

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete(paramName);
    else params.set(paramName, String(nextPage));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          Siguiente
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function productHref(id: string, searchParams: { toString(): string }): string {
  const query = searchParams.toString();
  const suffix = query ? `&return=${encodeURIComponent(query)}` : '';
  return `/inventario/${id}?from=compras${suffix}`;
}

export function PartyList({
  data,
  emptyLabel,
}: {
  data: PaginatedResult<PurchaseParty>;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-3">
      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        data.data.map((party) => (
          <Link
            key={party.id}
            href={`/compras/partes/${party.id}`}
            className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{party.name}</p>
              {!party.is_active && <Badge variant="warning">Inactivo</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[party.contact_name, party.phone, party.email].filter(Boolean).join(' · ') ||
                'Sin contacto'}
            </p>
          </Link>
        ))
      )}
      <CatalogPagination page={data.page} totalPages={data.totalPages} paramName="paginaPartes" />
    </div>
  );
}

function ProductRows({
  data,
  emptyLabel,
  emphasizePrice = false,
}: {
  data: PaginatedResult<CatalogProductRow>;
  emptyLabel: string;
  emphasizePrice?: boolean;
}) {
  const searchParams = useSearchParams();
  return (
    <div className="space-y-3">
      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        data.data.map((product) => (
          <Link
            key={product.id}
            href={productHref(product.id, searchParams)}
            className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{product.name}</p>
                  <Badge variant="default">
                    {INVENTORY_PRODUCT_CATEGORY_LABELS[product.category]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    product.sku ? `SKU ${product.sku}` : null,
                    product.manufacturer,
                    product.supplier_name,
                    product.catalog_category_name,
                    `${Number(product.quantity).toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${INVENTORY_UNIT_LABELS[product.unit]}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className={emphasizePrice ? 'text-right' : 'text-right text-sm'}>
                <p className="text-muted-foreground">
                  Costo {formatProductAmount(product.unit_cost, product.cost_currency)}
                  {product.margin_percent != null ? ` · ${product.margin_percent}%` : ''}
                </p>
                <p className={emphasizePrice ? 'text-base font-semibold' : 'font-medium'}>
                  Venta {formatProductAmount(product.unit_price, 'ARS')}
                </p>
              </div>
            </div>
          </Link>
        ))
      )}
      <CatalogPagination page={data.page} totalPages={data.totalPages} paramName="pagina" />
    </div>
  );
}

export function CatalogProductList({
  data,
  emptyLabel,
}: {
  data: PaginatedResult<CatalogProductRow>;
  emptyLabel: string;
}) {
  return <ProductRows data={data} emptyLabel={emptyLabel} />;
}

export function SalePriceList({ data }: { data: PaginatedResult<CatalogProductRow> }) {
  return (
    <ProductRows
      data={data}
      emphasizePrice
      emptyLabel="Todavía no hay precios de venta. Cargá un costo y un % de ganancia en el producto."
    />
  );
}

export function CatalogFilters({
  categories,
  suppliers,
}: {
  categories: PurchaseCategory[];
  suppliers: Array<{ id: string; name: string }>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const change = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('pagina');
    router.push(`${pathname}?${params.toString()}`);
  };
  return (
    <div className="flex flex-wrap gap-3">
      <Select
        aria-label="Filtrar categoría personalizada"
        className="max-w-xs"
        value={searchParams.get('grupo') ?? ''}
        onChange={(event) => change('grupo', event.target.value)}
      >
        <option value="">Todas las categorías personalizadas</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filtrar proveedor"
        className="max-w-xs"
        value={searchParams.get('proveedor') ?? ''}
        onChange={(event) => change('proveedor', event.target.value)}
      >
        <option value="">Todos los proveedores</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
